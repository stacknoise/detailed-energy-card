import { describe, expect, it } from "vitest";
import { computeModel, listRemainder, metered, type Reader } from "../src/model/compute";
import { collectEnergyIds, collectEntityIds, hasEnergy, validateConfig, type EnergyCardConfig } from "../src/model/config";
import { consumerEntitiesExcept, findDuplicates, toggleFloors } from "../src/editor/config-utils";
import { floorFields, hasEnergySensor, roomFields } from "../src/editor/schema";

const reader = (values: Record<string, number>): Reader => (id) =>
  id in values ? { watts: values[id], valid: true } : { watts: 0, valid: false };

// EG with a meter in the distribution board and a kitchen meter, OG without meters (like mock A2)
const CFG: EnergyCardConfig = {
  type: "custom:detailed-energy-card",
  home: { total_entity: "sensor.total", total_energy_entity: "sensor.total_e" },
  floors: [
    {
      floor_id: "eg",
      entity: "sensor.eg",
      energy_entity: "sensor.eg_e",
      rooms: [
        { area_id: "kueche", entity: "sensor.kueche", energy_entity: "sensor.kueche_e", consumers: [{ entity: "sensor.ofen", energy_entity: "sensor.ofen_e" }, { entity: "sensor.spuel" }] },
        { area_id: "wohnen", consumers: [{ entity: "sensor.tv" }] },
      ],
    },
    { floor_id: "og", rooms: [{ area_id: "bad", consumers: [{ entity: "sensor.boiler" }] }] },
  ],
};

describe("meters of rooms and floors", () => {
  it("takes the value of a room or a floor from its own meter", () => {
    const m = computeModel(CFG, reader({ "sensor.total": 3000, "sensor.eg": 2600, "sensor.kueche": 2100, "sensor.ofen": 1500, "sensor.spuel": 400, "sensor.tv": 300, "sensor.boiler": 200 }));
    const [eg, og] = m.floors;
    const [kueche, wohnen] = eg.rooms;
    expect(kueche.watts).toBe(2100);
    expect(kueche.meter).toEqual({ metered: true, unassigned: 200, excess: undefined });
    // without a meter: the sum, no meter info
    expect(wohnen.watts).toBe(300);
    expect(wohnen.meter).toBeUndefined();
    // the floor meter against the rooms (metered kitchen + summed living room = 2400)
    expect(eg.watts).toBe(2600);
    expect(eg.meter?.unassigned).toBe(200);
    expect(og.watts).toBe(200);
    // the home counts the floors as shown, nothing twice
    expect(m.unassigned).toBe(3000 - 2600 - 200);
  });

  it("uses the energy counters in the energy mode", () => {
    const m = computeModel(CFG, reader({ "sensor.total_e": 19500, "sensor.eg_e": 12600, "sensor.kueche_e": 9100, "sensor.ofen_e": 8700 }), undefined, undefined, true);
    const [kueche] = m.floors[0].rooms;
    expect(kueche.watts).toBe(9100);
    expect(kueche.meter?.unassigned).toBe(400);
    expect(m.floors[0].watts).toBe(12600);
  });

  it("falls back to the sum when the meter cannot be read, and says so", () => {
    const m = computeModel(CFG, reader({ "sensor.ofen": 1500, "sensor.spuel": 400, "sensor.tv": 300 }));
    const [kueche] = m.floors[0].rooms;
    expect(kueche.watts).toBe(1900);
    expect(kueche.meter).toEqual({ metered: false, invalid: true, unassigned: 0 });
    expect(m.floors[0].watts).toBe(2200);
  });

  it("warns when the children measure clearly more than the meter, never with a negative remainder", () => {
    // 1900 W of consumers on a 1700 W meter: 200 W over, more than 5 % and 10 W
    expect(metered("sensor.m", 1900, reader({ "sensor.m": 1700 }), false).meter).toEqual({ metered: true, unassigned: 0, excess: 200 });
    // 5 % of 1000 W is 50 W: 40 W over is no warning
    expect(metered("sensor.m", 1040, reader({ "sensor.m": 1000 }), false).meter).toEqual({ metered: true, unassigned: 0, excess: undefined });
    // small values: 8 W over 100 W is 8 %, but below 10 W
    expect(metered("sensor.m", 108, reader({ "sensor.m": 100 }), false).meter?.excess).toBeUndefined();
    expect(metered("sensor.m", 112, reader({ "sensor.m": 100 }), false).meter?.excess).toBe(12);
    // energy mode: at least 50 Wh
    expect(metered("sensor.m", 540, reader({ "sensor.m": 500 }), true).meter?.excess).toBeUndefined();
    expect(metered("sensor.m", 600, reader({ "sensor.m": 500 }), true).meter?.excess).toBe(100);
    // no meter: the sum
    expect(metered(undefined, 42, reader({}), false)).toEqual({ watts: 42 });
  });

  it("allows a room with a meter and no consumers", () => {
    const cfg: EnergyCardConfig = { type: "x", rooms: [{ area_id: "flur", entity: "sensor.flur" }] };
    expect(() => validateConfig(cfg)).not.toThrow();
    const m = computeModel(cfg, reader({ "sensor.flur": 40 }));
    expect(m.rooms[0].watts).toBe(40);
    expect(listRemainder(m, undefined, m.rooms[0])).toEqual({ scope: "room", name: "flur", value: 40, excess: undefined });
  });
});

describe("unassigned in the list", () => {
  const values = { "sensor.total": 3000, "sensor.eg": 2600, "sensor.kueche": 2100, "sensor.ofen": 1500, "sensor.spuel": 400, "sensor.tv": 300, "sensor.boiler": 200 };
  const m = computeModel(CFG, reader(values));
  const [eg, og] = m.floors;

  it("shows the remainder of the selected room only with a room meter", () => {
    expect(listRemainder(m, eg, eg.rooms[0])).toMatchObject({ scope: "room", name: "kueche", value: 200 });
    expect(listRemainder(m, eg, eg.rooms[1])).toBeUndefined();
  });

  it("shows the floor minus all of its consumers when the floor or a room is metered", () => {
    expect(listRemainder(m, eg)).toMatchObject({ scope: "floor", name: "eg", value: 2600 - 1500 - 400 - 300 });
    expect(listRemainder(m, og)).toBeUndefined();
  });

  it("shows the home minus all consumers, as before without meters", () => {
    expect(listRemainder(m)).toEqual({ scope: "home", value: 3000 - 1500 - 400 - 300 - 200 });
    const plain = computeModel({ ...CFG, floors: CFG.floors!.map(({ entity, energy_entity, ...f }) => ({ ...f, rooms: f.rooms!.map(({ entity, energy_entity, ...r }) => r) })) }, reader(values));
    expect(listRemainder(plain)!.value).toBe(plain.unassigned);
  });

  it("reports the excess instead when the children measure more", () => {
    const over = computeModel(CFG, reader({ ...values, "sensor.kueche": 1700, "sensor.eg": 1800 }));
    expect(listRemainder(over, over.floors[0], over.floors[0].rooms[0])).toEqual({ scope: "room", name: "kueche", value: 0, excess: 200 });
    // rooms: 1700 (kitchen meter) + 300 = 2000 on an 1800 W floor meter
    expect(listRemainder(over, over.floors[0])).toMatchObject({ scope: "floor", excess: 200 });
  });
});

describe("meter configuration", () => {
  it("accepts sensors as meters and rejects anything else", () => {
    expect(() => validateConfig(CFG)).not.toThrow();
    expect(() => validateConfig({ type: "x", floors: [{ floor_id: "eg", entity: "switch.x" }] })).toThrow(/floors\[0\]\.entity/);
    expect(() => validateConfig({ type: "x", rooms: [{ area_id: "a", energy_entity: "light.x" }] })).toThrow(/rooms\[0\]\.energy_entity/);
  });

  it("rejects a meter that is also a consumer or another meter", () => {
    expect(() => validateConfig({ type: "x", rooms: [{ area_id: "a", entity: "sensor.x", consumers: [{ entity: "sensor.x" }] }] })).toThrow(/rooms\[0\]\.consumers\[0\].*already assigned to rooms\[0\]\.entity/);
    expect(() =>
      validateConfig({ type: "x", floors: [{ floor_id: "eg", energy_entity: "sensor.e", rooms: [{ area_id: "a", energy_entity: "sensor.e" }] }] }),
    ).toThrow(/floors\[0\]\.rooms\[0\]\.energy_entity.*already assigned to floors\[0\]\.energy_entity/);
  });

  it("collects the meters and counts energy meters for the energy mode", () => {
    expect(collectEntityIds(CFG)).toEqual(expect.arrayContaining(["sensor.eg", "sensor.kueche"]));
    expect(collectEnergyIds(CFG)).toEqual(expect.arrayContaining(["sensor.eg_e", "sensor.kueche_e"]));
    const onlyRoomMeter: EnergyCardConfig = { type: "x", rooms: [{ area_id: "a", energy_entity: "sensor.e" }] };
    const onlyFloorMeter: EnergyCardConfig = { type: "x", floors: [{ floor_id: "eg", energy_entity: "sensor.e" }] };
    for (const cfg of [onlyRoomMeter, onlyFloorMeter]) {
      expect(hasEnergy(cfg)).toBe(true);
      expect(hasEnergySensor(cfg)).toBe(true);
    }
  });
});

describe("meters in the editor", () => {
  it("offers power and energy meters on floors and rooms, without sensors taken elsewhere", () => {
    const paths = (fields: { path: string }[]) => fields.map((f) => f.path);
    expect(paths(floorFields())).toEqual(["floor_id", "entity", "energy_entity", "color"]);
    expect(paths(roomFields())).toEqual(["area_id", "entity", "energy_entity", "color"]);
    const [, power] = roomFields([], ["sensor.taken"]);
    expect(power.selector).toEqual({ entity: { domain: "sensor", device_class: "power", exclude_entities: ["sensor.taken"] } });
  });

  it("counts meters as taken, except the own slot", () => {
    const taken = (ptr: (string | number)[]) => consumerEntitiesExcept(CFG, ptr).sort();
    // the kitchen meter fields: everything but the kitchen's own meters
    expect(taken(["floors", 0, "rooms", 0])).not.toContain("sensor.kueche");
    expect(taken(["floors", 0, "rooms", 0])).toEqual(expect.arrayContaining(["sensor.eg", "sensor.eg_e", "sensor.ofen", "sensor.tv"]));
    // the floor meter fields: not its own meters
    expect(taken(["floors", 0])).not.toContain("sensor.eg");
    expect(taken(["floors", 0])).toEqual(expect.arrayContaining(["sensor.kueche", "sensor.kueche_e"]));
    // a consumer sees the meters as taken
    expect(taken(["floors", 0, "rooms", 1, "consumers", 0])).toEqual(expect.arrayContaining(["sensor.eg", "sensor.kueche_e"]));
  });

  it("reports a meter that is used twice", () => {
    const dup: EnergyCardConfig = {
      type: "x",
      floors: [{ floor_id: "eg", name: "EG", entity: "sensor.x", rooms: [{ area_id: "a", name: "A", consumers: [{ entity: "sensor.x" }] }] }],
    };
    expect(findDuplicates(dup)).toEqual([{ entity: "sensor.x", places: ["EG", "EG › A"] }]);
  });

  it("keeps room meters when floors are switched off, and drops a restored meter that is taken", () => {
    const flat = toggleFloors(CFG, false);
    expect(flat.rooms?.[0]).toMatchObject({ area_id: "kueche", entity: "sensor.kueche", energy_entity: "sensor.kueche_e" });
    const restored = toggleFloors({ type: "x", floors: [{ floor_id: "eg", rooms: [{ area_id: "a", consumers: [{ entity: "sensor.m" }] }] }] }, false, [], [
      { area_id: "b", entity: "sensor.m", energy_entity: "sensor.free" },
    ]);
    expect(restored.rooms?.[1]).toEqual({ area_id: "b", energy_entity: "sensor.free", consumers: [] });
  });
});
