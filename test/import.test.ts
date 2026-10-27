import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applySections, buildSections, checkedConfig } from "../src/editor/import/apply";
import { collectPrefs, powerSensors, type ImportHass } from "../src/editor/import/collect";
import { moveConsumer, propose, setConsumer, setFloor, setRoom, summarize } from "../src/editor/import/propose";
import type { EnergyCardConfig } from "../src/model/config";

const fixture = (name: string): unknown => JSON.parse(readFileSync(`test/fixtures/${name}`, "utf8"));
const prefs = fixture("energy-prefs.json");

const energy = { device_class: "energy", unit_of_measurement: "kWh" };
const power = { device_class: "power", unit_of_measurement: "W" };
const states: ImportHass["states"] = Object.fromEntries([
  ...["grid_import", "grid_export", "pv_energy", "bat_discharged", "bat_charged", "oven_energy", "fridge_energy", "tv_energy", "heatpump_energy", "heatpump_boiler_energy", "shed_energy", "office_energy"].map((n) => [`sensor.${n}`, { attributes: energy }]),
  ...["grid_power", "tv_power", "oven_power", "pv_power", "bat_power", "heatpump_power", "heatpump_pump", "heatpump_boiler_power"].map((n) => [`sensor.${n}`, { attributes: power }]),
  ["sensor.bat_soc", { attributes: { device_class: "battery", unit_of_measurement: "%" } }],
  ["sensor.oven_energy", { attributes: { ...energy, friendly_name: "Backofen" } }],
]);
const hass: ImportHass = {
  states,
  entities: {
    "sensor.oven_energy": { device_id: "d_oven" },
    "sensor.oven_power": { device_id: "d_oven" },
    "sensor.fridge_energy": { device_id: "d_fridge" },
    "sensor.tv_energy": { area_id: "wohnzimmer" },
    "sensor.heatpump_energy": { device_id: "d_hp" },
    "sensor.heatpump_power": { device_id: "d_hp" },
    "sensor.heatpump_pump": { device_id: "d_hp" },
    "sensor.heatpump_boiler_energy": { device_id: "d_hp" },
    "sensor.heatpump_boiler_power": { device_id: "d_hp" },
    "sensor.pv_energy": { device_id: "d_pv" },
    "sensor.pv_power": { device_id: "d_pv" },
    "sensor.bat_discharged": { device_id: "d_bat" },
    "sensor.bat_power": { device_id: "d_bat" },
    "sensor.office_energy": { device_id: "d_office" },
    "sensor.shed_energy": {},
  },
  devices: { d_oven: { area_id: "kueche" }, d_fridge: { area_id: "kueche" }, d_hp: { area_id: "technik" }, d_office: { area_id: "buero" } },
  areas: {
    kueche: { area_id: "kueche", name: "Küche", floor_id: "eg" },
    wohnzimmer: { area_id: "wohnzimmer", name: "Wohnzimmer", floor_id: "eg" },
    technik: { area_id: "technik", name: "Technikraum", floor_id: "keller" },
    buero: { area_id: "buero", name: "Büro" },
    garten: { area_id: "garten", name: "Garten" },
  },
  floors: { eg: { floor_id: "eg", name: "Erdgeschoss", level: 0 }, keller: { floor_id: "keller", name: "Keller", level: -1 } },
};

describe("collect: sources and devices from energy/get_prefs", () => {
  const c = collectPrefs(prefs, hass);

  it("reads grid, solar and battery with both directions, and leaves gas out", () => {
    expect(c.sources.map((s) => s.type)).toEqual(["grid", "solar", "battery"]);
    expect(c.sources[0]).toMatchObject({ energy: "sensor.grid_import", energyReturn: "sensor.grid_export", power: "sensor.grid_power", usable: true });
    expect(c.sources[2]).toMatchObject({ energy: "sensor.bat_discharged", energyReturn: "sensor.bat_charged", soc: "sensor.bat_soc" });
  });

  it("finds the power sensor at the same device when the dashboard has none, and asks when there are several", () => {
    expect(c.sources[1].power).toBe("sensor.pv_power");
    expect(c.sources[2].power).toBe("sensor.bat_power");
    const oven = c.devices.find((d) => d.stat === "sensor.oven_energy")!;
    expect(oven.power).toBe("sensor.oven_power");
    const hp = c.devices.find((d) => d.stat === "sensor.heatpump_energy")!;
    expect(hp.power).toBeUndefined();
    // the energy counter itself is not a candidate, the three power sensors of the device are
    expect(hp.powerChoices).toEqual(["sensor.heatpump_boiler_power", "sensor.heatpump_power", "sensor.heatpump_pump"]);
    // stat_rate of the dashboard wins
    expect(c.devices.find((d) => d.stat === "sensor.tv_energy")!.power).toBe("sensor.tv_power");
  });

  it("places a device by its own area, else the area of its device, and names it", () => {
    expect(c.devices.find((d) => d.stat === "sensor.oven_energy")).toMatchObject({ areaId: "kueche", name: "Backofen" });
    expect(c.devices.find((d) => d.stat === "sensor.tv_energy")!.areaId).toBe("wohnzimmer");
    expect(c.devices.find((d) => d.stat === "sensor.fridge_energy")!.name).toBe("Kühlschrank");
    expect(c.devices.find((d) => d.stat === "sensor.shed_energy")!.areaId).toBeUndefined();
  });

  it("marks external statistics as unusable", () => {
    expect(c.devices.find((d) => d.stat === "tibber:consumption_home")).toMatchObject({ usable: false, name: "tibber:consumption_home" });
  });

  it("understands the old form of the grid with lists, and an empty or broken answer", () => {
    const legacy = collectPrefs(fixture("energy-prefs-legacy-grid.json"), hass);
    expect(legacy.sources).toHaveLength(1);
    expect(legacy.sources[0]).toMatchObject({ type: "grid", energy: "sensor.grid_import", energyReturn: "sensor.grid_export" });
    for (const bad of [null, undefined, 42, "x", [], {}, { energy_sources: "x", device_consumption: [null, 1, {}] }]) {
      expect(collectPrefs(bad, hass)).toMatchObject({ sources: [], devices: [], empty: true });
    }
  });

  it("lists the power sensors of the installation", () => {
    expect(powerSensors(hass)).toContain("sensor.heatpump_pump");
    expect(powerSensors(hass)).not.toContain("sensor.bat_soc");
  });
});

describe("propose: the structure", () => {
  const p = propose(collectPrefs(prefs, hass), hass);

  it("orders floors by level and groups rooms and devices by area", () => {
    expect(p.floors.map((f) => f.name)).toEqual(["Keller", "Erdgeschoss"]);
    const eg = p.floors[1];
    expect(eg.rooms.map((r) => r.name)).toEqual(["Küche", "Wohnzimmer"]);
    expect(eg.rooms[0].consumers.map((c) => c.stat).sort()).toEqual(["sensor.fridge_energy", "sensor.oven_energy"]);
  });

  it("puts areas without a floor and devices without an area in their own places, the devices off", () => {
    expect(p.looseRooms.map((r) => r.name)).toEqual(["Büro"]);
    expect(p.noRoom.map((c) => c.stat).sort()).toEqual(["sensor.shed_energy", "tibber:consumption_home"]);
    expect(p.noRoom.every((c) => !c.selected)).toBe(true);
  });

  it("makes the parent of a family the meter of the room, its parts devices", () => {
    const keller = p.floors[0].rooms[0];
    expect(keller.meter?.stat).toBe("sensor.heatpump_energy");
    expect(keller.consumers.map((c) => c.stat)).toEqual(["sensor.heatpump_boiler_energy"]);
    expect(keller.consumers[0].parent).toBe("sensor.heatpump_energy");
  });

  it("leaves the parts out by default when the parent is not the meter of the same room, nothing twice", () => {
    // sensor.office_energy is part of the TV, which is in another room than the office
    const tv = p.floors[1].rooms[1].consumers.find((c) => c.stat === "sensor.tv_energy")!;
    expect(tv.selected).toBe(true);
    const office = p.looseRooms[0].consumers[0];
    expect(office).toMatchObject({ stat: "sensor.office_energy", coveredByParent: true, selected: false });
  });

  it("selects what can be taken over: sources with a power sensor, devices that are entities", () => {
    expect(p.sources.map((s) => s.selected)).toEqual([true, true, true]);
    expect(summarize(p)).toMatchObject({ sources: 3, floors: 2, rooms: 3 });
  });

  it("leaves a source without any power sensor off until one is chosen", () => {
    const lone = propose(collectPrefs({ energy_sources: [{ type: "solar", stat_energy_from: "sensor.shed_energy" }] }, hass), hass);
    expect(lone.sources[0]).toMatchObject({ selected: false });
  });
});

describe("propose: switching on and off", () => {
  it("a floor takes its rooms and devices along, a device switched on brings its room and floor back", () => {
    const p = propose(collectPrefs(prefs, hass), hass);
    setFloor(p, "eg", false);
    expect(p.floors[1].rooms.every((r) => !r.selected && r.consumers.every((c) => !c.selected))).toBe(true);
    expect(summarize(p).floors).toBe(1);
    setConsumer(p, "sensor.oven_energy", true);
    expect(p.floors[1].selected).toBe(true);
    expect(p.floors[1].rooms[0].selected).toBe(true);
    expect(p.floors[1].rooms[1].selected).toBe(false);
  });

  it("a room off drops its meter too; devices that cannot be taken over stay off", () => {
    const p = propose(collectPrefs(prefs, hass), hass);
    setRoom(p, "technik", false);
    expect(p.floors[0].rooms[0].meter?.selected).toBe(false);
    setRoom(p, "technik", true);
    expect(p.floors[0].rooms[0].meter?.selected).toBe(true);
    setConsumer(p, "tibber:consumption_home", true);
    expect(p.noRoom.find((c) => c.stat === "tibber:consumption_home")!.selected).toBe(false);
  });

  it("moves a device to another room, creating the room on its floor, or back to no room", () => {
    const p = propose(collectPrefs(prefs, hass), hass);
    moveConsumer(p, hass, "sensor.shed_energy", "garten");
    expect(p.noRoom.map((c) => c.stat)).not.toContain("sensor.shed_energy");
    const garten = p.looseRooms.find((r) => r.areaId === "garten")!;
    expect(garten.consumers[0]).toMatchObject({ stat: "sensor.shed_energy", selected: true, areaId: "garten" });
    moveConsumer(p, hass, "sensor.shed_energy", "kueche");
    expect(p.floors[1].rooms[0].consumers.map((c) => c.stat)).toContain("sensor.shed_energy");
    moveConsumer(p, hass, "sensor.shed_energy", undefined);
    expect(p.noRoom.find((c) => c.stat === "sensor.shed_energy")).toMatchObject({ selected: false, areaId: undefined });
  });
});

describe("apply: replace and merge", () => {
  const proposal = () => propose(collectPrefs(prefs, hass), hass);

  it("builds sources, floors, rooms and consumers from the selection, rooms without a floor are reported", () => {
    const p = proposal();
    // the office is part of the TV and left out by default: switched on it is a room without a floor
    setConsumer(p, "sensor.office_energy", true);
    const s = buildSections(p);
    expect(s.sources).toEqual([
      { entity: "sensor.grid_power", type: "grid", energy_entity: "sensor.grid_import", energy_entity_return: "sensor.grid_export" },
      { entity: "sensor.pv_power", type: "solar", energy_entity: "sensor.pv_energy" },
      { entity: "sensor.bat_power", type: "battery", energy_entity: "sensor.bat_discharged", energy_entity_return: "sensor.bat_charged", soc_entity: "sensor.bat_soc" },
    ]);
    expect(s.floors?.map((f) => f.floor_id)).toEqual(["keller", "eg"]);
    const keller = s.floors![0].rooms![0];
    // the parent measures the room, the part is a consumer with its counter only
    expect(keller).toMatchObject({ area_id: "technik", energy_entity: "sensor.heatpump_energy", consumers: [{ energy_entity: "sensor.heatpump_boiler_energy" }] });
    const kueche = s.floors![1].rooms![0];
    expect(kueche.consumers).toContainEqual({ energy_entity: "sensor.oven_energy", entity: "sensor.oven_power" });
    expect(kueche.consumers).toContainEqual({ energy_entity: "sensor.fridge_energy" });
    expect(s.unplaced).toEqual(["buero"]);
  });

  it("uses a chosen power sensor and a new name, and a sensor only once", () => {
    const p = proposal();
    const hp = p.floors[0].rooms[0].meter!;
    expect(hp.power).toBeUndefined();
    hp.power = "sensor.oven_power";
    p.floors[1].rooms[0].consumers.find((c) => c.stat === "sensor.fridge_energy")!.rename = "Eisschrank";
    const s = buildSections(p);
    // the heat pump room comes first and takes the sensor; the oven, later, has only its counter
    expect(s.floors![0].rooms![0].entity).toBe("sensor.oven_power");
    expect(s.floors![1].rooms![0].consumers).toContainEqual({ energy_entity: "sensor.oven_energy" });
    expect(s.floors![1].rooms![0].consumers).toContainEqual({ energy_entity: "sensor.fridge_energy", name: "Eisschrank" });
  });

  it("builds a card from rooms when no selected room has a floor", () => {
    const p = proposal();
    setFloor(p, "eg", false);
    setFloor(p, "keller", false);
    setConsumer(p, "sensor.office_energy", true);
    const s = buildSections(p);
    expect(s.floors).toBeUndefined();
    expect(s.rooms).toEqual([{ area_id: "buero", consumers: [{ energy_entity: "sensor.office_energy" }] }]);
  });

  it("replace writes the new structure and keeps title, colors and options", () => {
    const existing: EnergyCardConfig = { type: "custom:detailed-energy-card", title: "Haus", options: { unit: "kW" }, colors: { accent: "#fff" }, rooms: [{ area_id: "alt", consumers: [{ entity: "sensor.alt" }] }], sources: [{ entity: "sensor.alt_pv", type: "solar" }] };
    const out = applySections(existing, buildSections(proposal()), "replace");
    expect(out).toMatchObject({ title: "Haus", options: { unit: "kW" }, colors: { accent: "#fff" } });
    expect(out.rooms).toBeUndefined();
    expect(out.floors).toHaveLength(2);
    expect(out.sources).toHaveLength(3);
    expect(checkedConfig(out).error).toBeUndefined();
  });

  it("merge adds only what is missing and keeps what exists untouched", () => {
    const existing: EnergyCardConfig = {
      type: "custom:detailed-energy-card",
      sources: [{ entity: "sensor.pv_power", type: "solar", name: "Dach", color: "#ff0" }],
      floors: [
        { floor_id: "eg", color: "#0f0", rooms: [{ area_id: "kueche", color: "#00f", consumers: [{ entity: "sensor.oven_power", name: "Herd", thresholds: [{ from: 0, color: "#0f0" }] }] }] },
      ],
    };
    const out = applySections(existing, buildSections(proposal()), "merge");
    // the solar source is there already (same power sensor): it keeps name and color and only gets its counter; grid and battery are added
    expect(out.sources!.map((s) => s.type)).toEqual(["solar", "grid", "battery"]);
    expect(out.sources![0]).toMatchObject({ name: "Dach", color: "#ff0", energy_entity: "sensor.pv_energy" });
    const eg = out.floors!.find((f) => f.floor_id === "eg")!;
    expect(eg.color).toBe("#0f0");
    const kueche = eg.rooms!.find((r) => r.area_id === "kueche")!;
    expect(kueche.color).toBe("#00f");
    // the oven exists under its power sensor: it is not added again, it gets its counter; the fridge is new
    expect(kueche.consumers!.map((c) => c.entity ?? c.energy_entity)).toEqual(["sensor.oven_power", "sensor.fridge_energy"]);
    expect(kueche.consumers![0]).toMatchObject({ name: "Herd", energy_entity: "sensor.oven_energy", thresholds: [{ from: 0, color: "#0f0" }] });
    // the configuration that was handed in is not changed
    expect(existing.sources![0].energy_entity).toBeUndefined();
    expect(existing.floors![0].rooms![0].consumers![0].energy_entity).toBeUndefined();
    expect(out.floors!.map((f) => f.floor_id)).toEqual(["eg", "keller"]);
    expect(checkedConfig(out).error).toBeUndefined();
  });

  it("merge does not give a counter to an entry that has one, nor one that is used elsewhere", () => {
    const existing: EnergyCardConfig = {
      type: "custom:detailed-energy-card",
      sources: [{ entity: "sensor.pv_power", type: "solar", energy_entity: "sensor.eigener_zaehler" }],
      rooms: [{ area_id: "kueche", consumers: [{ entity: "sensor.oven_power" }, { entity: "sensor.x", energy_entity: "sensor.fridge_energy" }] }],
    };
    const out = applySections(existing, buildSections(proposal()), "merge");
    expect(out.sources![0].energy_entity).toBe("sensor.eigener_zaehler");
    // the fridge counter belongs to another consumer: not added again
    const kueche = out.rooms!.find((r) => r.area_id === "kueche")!;
    expect(kueche.consumers!.filter((c) => c.energy_entity === "sensor.fridge_energy")).toHaveLength(1);
    expect(kueche.consumers![0].energy_entity).toBe("sensor.oven_energy");
  });

  it("merge twice changes nothing the second time", () => {
    const once = applySections(undefined, buildSections(proposal()), "merge");
    const twice = applySections(once, buildSections(proposal()), "merge");
    expect(twice).toEqual(once);
  });

  it("merge into a card with rooms dissolves the floors of the proposal into rooms", () => {
    const existing: EnergyCardConfig = { type: "custom:detailed-energy-card", rooms: [{ area_id: "kueche", consumers: [{ entity: "sensor.alt" }] }] };
    const out = applySections(existing, buildSections(proposal()), "merge");
    expect(out.floors).toBeUndefined();
    expect(out.rooms!.map((r) => r.area_id)).toEqual(["kueche", "technik", "wohnzimmer"]);
    expect(out.rooms![0].consumers!.map((c) => c.entity ?? c.energy_entity)).toEqual(["sensor.alt", "sensor.fridge_energy", "sensor.oven_power"]);
  });

  it("reports what the card would refuse", () => {
    const bad: EnergyCardConfig = { type: "x", rooms: [{ area_id: "a", consumers: [{}] }] };
    expect(checkedConfig(bad).error).toMatch(/entity or energy_entity is required/);
  });
});
