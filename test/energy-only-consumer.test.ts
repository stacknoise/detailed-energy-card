import { describe, expect, it } from "vitest";
import { computeModel, listedConsumers, nodeValues, type Reader } from "../src/model/compute";
import { collectEnergyIds, collectEntityIds, validateConfig, ConfigError, type EnergyCardConfig } from "../src/model/config";
import { treeSeries } from "../src/model/timeline";

const base = { type: "custom:detailed-energy-card" };
const cfg: EnergyCardConfig = {
  type: "x",
  rooms: [
    {
      area_id: "kueche",
      consumers: [
        { entity: "sensor.ofen", energy_entity: "sensor.ofen_e" },
        { energy_entity: "sensor.spuel_e", name: "Spülmaschine" },
        { entity: "sensor.kuehl" },
      ],
    },
  ],
};
const reader = (m: Record<string, number>): Reader => (id) => (id in m ? { watts: m[id], valid: true } : { watts: 0, valid: false });

describe("consumers with only an energy counter", () => {
  it("accepts a consumer with a power sensor, an energy counter or both, and one without any (the editor creates it empty)", () => {
    expect(() => validateConfig(cfg)).not.toThrow();
    expect(() => validateConfig({ ...base, rooms: [{ area_id: "a", consumers: [{ name: "x" }] }] })).not.toThrow();
    expect(() => validateConfig({ ...base, rooms: [{ area_id: "a", consumers: [{ entity: "", energy_entity: "" }] }] })).not.toThrow();
    expect(() => validateConfig({ ...base, rooms: [{ area_id: "a", consumers: ["x"] }] })).toThrow(ConfigError);
  });

  it("shows a consumer without any sensor as a warning that counts nothing, with a key of its own", () => {
    const m = computeModel({ ...base, rooms: [{ area_id: "a", consumers: [{ name: "x" }, { entity: "" }, { entity: "sensor.ofen" }] }], consumers: [{ name: "y" }] }, reader({ "sensor.ofen": 100 }));
    const [a, b, ofen] = m.rooms[0].consumers;
    expect([a.noSensor, b.noSensor, ofen.noSensor]).toEqual([true, true, undefined]);
    expect(a.valid).toBe(false);
    expect(a.watts).toBe(0);
    expect(new Set([a.entity, b.entity, m.consumers[0].entity]).size).toBe(3);
    expect(m.consumers[0].noSensor).toBe(true);
    expect(m.rooms[0].watts).toBe(100);
  });

  it("still checks the sensors that are set", () => {
    expect(() => validateConfig({ ...base, rooms: [{ area_id: "a", consumers: [{ energy_entity: "light.x" }] }] })).toThrow(/energy_entity/);
  });

  it("claims a counter once, like a power sensor", () => {
    const twice = { ...base, rooms: [{ area_id: "a", consumers: [{ energy_entity: "sensor.e" }, { entity: "sensor.p", energy_entity: "sensor.e" }] }] };
    expect(() => validateConfig(twice)).toThrow(/already assigned/);
  });

  it("asks for power states only of consumers that have a power sensor", () => {
    expect(collectEntityIds(cfg).sort()).toEqual(["sensor.kuehl", "sensor.ofen"]);
    expect(collectEnergyIds(cfg).sort()).toEqual(["sensor.ofen_e", "sensor.spuel_e"]);
  });

  it("is greyed out in the power mode: 0 W, no warning flag of its own, keyed by its counter", () => {
    const m = computeModel(cfg, reader({ "sensor.ofen": 800, "sensor.kuehl": 100 }));
    const [ofen, spuel, kuehl] = m.rooms[0].consumers;
    expect(spuel).toMatchObject({ entity: "sensor.spuel_e", watts: 0, valid: false, noPower: true });
    expect(ofen.noPower).toBeUndefined();
    expect(m.rooms[0].watts).toBe(900);
    // nothing for the second line of the node
    expect([...nodeValues(m).keys()]).not.toContain("c:sensor.spuel_e");
    expect(kuehl.watts).toBe(100);
  });

  it("counts in the energy mode, where a consumer without a counter is the one left out", () => {
    const m = computeModel(cfg, reader({ "sensor.ofen_e": 2000, "sensor.spuel_e": 1500 }), undefined, undefined, true);
    const [ofen, spuel, kuehl] = m.rooms[0].consumers;
    expect(spuel).toMatchObject({ watts: 1500, valid: true });
    expect(spuel.noPower).toBeUndefined();
    expect(ofen.watts).toBe(2000);
    expect(kuehl).toMatchObject({ noEnergy: true, valid: false });
    expect(m.rooms[0].watts).toBe(3500);
  });

  it("is hidden by only_active_consumers in the power mode, and not in the energy mode", () => {
    const power = computeModel(cfg, reader({ "sensor.ofen": 800, "sensor.kuehl": 0 }));
    expect(listedConsumers(power.rooms[0].consumers, true).map((c) => c.entity)).toEqual(["sensor.ofen"]);
    const energy = computeModel(cfg, reader({ "sensor.spuel_e": 1500, "sensor.ofen_e": 0 }), undefined, undefined, true);
    // a consumer without a counter stays listed as a warning, like any unreadable sensor
    expect(listedConsumers(energy.rooms[0].consumers, true).map((c) => c.entity)).toEqual(["sensor.spuel_e", "sensor.kuehl"]);
  });

  it("is keyed by its counter in the series of the timeline", () => {
    const rows = new Map([["sensor.spuel_e", [{ start: 0, wh: 100 }]]]);
    const s = treeSeries(cfg, rows, [0], 3_600_000);
    expect(s.consumers.get("sensor.spuel_e")).toEqual([100]);
  });
});
