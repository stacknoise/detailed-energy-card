import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applySections, buildSections, checkedConfig } from "../src/editor/import/apply";
import { collectPrefs, type ImportHass } from "../src/editor/import/collect";
import { propose, setConsumer, summarize } from "../src/editor/import/propose";

// The real answer of energy/get_prefs of the maintainer: every plug is a grid source (with a name and a price) and a device.
const prefs = JSON.parse(readFileSync("test/fixtures/energy-prefs-real.json", "utf8")) as {
  energy_sources: Array<{ stat_energy_from: string; stat_rate: string }>;
  device_consumption: Array<{ stat_consumption: string; stat_rate?: string; name: string }>;
};

const hass: ImportHass = {
  states: Object.fromEntries([
    ...prefs.energy_sources.flatMap((s) => [
      [s.stat_energy_from, { attributes: { device_class: "energy", unit_of_measurement: "kWh" } }],
      [s.stat_rate, { attributes: { device_class: "power", unit_of_measurement: "W" } }],
    ]),
  ]),
  entities: {},
  devices: {},
  areas: { keller: { area_id: "keller", name: "Keller", floor_id: "ug" }, kueche: { area_id: "kueche", name: "Küche", floor_id: "eg" } },
  floors: { ug: { floor_id: "ug", name: "UG", level: -1 }, eg: { floor_id: "eg", name: "EG", level: 0 } },
};

describe("the real Energy dashboard: every plug is a grid source and a device", () => {
  const collected = collectPrefs(prefs, hass);

  it("offers no sources: an entry that is a device is a device", () => {
    expect(prefs.energy_sources.length).toBe(37);
    expect(collected.sources).toEqual([]);
    expect(collected.foldedSources).toBe(37);
    expect(collected.devices).toHaveLength(prefs.device_consumption.length);
    expect(collected.empty).toBe(false);
  });

  it("reads the power sensor of a device, also from power_config, and the names", () => {
    const d = collected.devices.find((x) => x.stat === "sensor.steckdose_ke_luftentfeuchter_energy")!;
    expect(d).toMatchObject({ power: "sensor.steckdose_ke_luftentfeuchter_power", name: "Luftentfeuchter", usable: true });
    // the one device without stat_rate and with no power sensor at its device: no power sensor, nothing chosen for it
    const ap2 = collected.devices.find((x) => x.stat === "sensor.steckdose_ku_ap2_energy")!;
    expect(ap2.power).toBeUndefined();
    expect(ap2.name).toBe("Küche AP2");
  });

  it("reads the power sensor of a grid entry from power_config when stat_rate is missing", () => {
    const only = {
      energy_sources: [{ type: "solar", stat_energy_from: "sensor.a_energy", power_config: { stat_rate: "sensor.a_power" } }],
    };
    const h: ImportHass = { states: { "sensor.a_energy": { attributes: {} }, "sensor.a_power": { attributes: { device_class: "power" } } } };
    expect(collectPrefs(only, h).sources[0].power).toBe("sensor.a_power");
  });

  it("keeps the devices when they are taken over: no counter is lost to a source", () => {
    const p = propose(collected, hass);
    expect(p.sources).toEqual([]);
    expect(p.foldedSources).toBe(37);
    // without areas every device is under "no room", off; switch two on and put them into a room
    expect(p.noRoom).toHaveLength(37);
    expect(summarize(p)).toMatchObject({ sources: 0, consumers: 0, skipped: 37 });
    const stat = "sensor.steckdose_ke_luftentfeuchter_energy";
    p.looseRooms.push({ areaId: "keller", name: "Keller", selected: true, consumers: [] });
    const device = p.noRoom.splice(p.noRoom.findIndex((c) => c.stat === stat), 1)[0];
    device.areaId = "keller";
    p.looseRooms[0].consumers.push(device);
    setConsumer(p, stat, true);
    const s = buildSections(p);
    expect(s.rooms).toEqual([{ area_id: "keller", consumers: [{ energy_entity: stat, entity: "sensor.steckdose_ke_luftentfeuchter_power" }] }]);
    expect(checkedConfig(applySections(undefined, s, "replace")).error).toBeUndefined();
  });
});
