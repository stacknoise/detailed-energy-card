import { describe, expect, it } from "vitest";
import { takenWhere } from "../src/editor/config-utils";
import { fieldErrors } from "../src/editor/validation";
import { consumerFields } from "../src/editor/schema";
import { getPath } from "../src/editor/config-utils";
import type { EnergyCardConfig } from "../src/model/config";

const cfg: EnergyCardConfig = {
  type: "x",
  consumers: [{ entity: "sensor.lamp" }],
  floors: [{ floor_id: "eg", entity: "sensor.eg", rooms: [{ area_id: "kueche", entity: "sensor.k", consumers: [{ entity: "sensor.oven", energy_entity: "sensor.oven_e" }] }] }],
  rooms: [{ area_id: "bad", consumers: [{ entity: "sensor.boiler" }] }],
};
const names = { room: (r: { area_id: string }) => `R:${r.area_id}`, floor: (f: { floor_id: string }) => `F:${f.floor_id}`, home: "Home" };

describe("takenWhere", () => {
  it("says where a sensor is assigned: the room of a consumer or meter, the floor of a meter, the home", () => {
    const m = takenWhere(cfg, ["consumers", 0], names);
    expect(Object.fromEntries(m)).toEqual({
      "sensor.k": "R:kueche",
      "sensor.oven": "R:kueche",
      "sensor.oven_e": "R:kueche",
      "sensor.eg": "F:eg",
      "sensor.boiler": "R:bad",
    });
  });
  it("leaves out the slot itself and names the home for a consumer under it", () => {
    expect(takenWhere(cfg, ["rooms", 0, "consumers", 0], names).get("sensor.boiler")).toBeUndefined();
    expect(takenWhere(cfg, ["rooms", 0, "consumers", 0], names).get("sensor.lamp")).toBe("Home");
  });
});

describe("fieldErrors with taken sensors", () => {
  const states = { "sensor.oven": { state: "1", attributes: { device_class: "power", unit_of_measurement: "W" } } };
  const fields = consumerFields([]);
  it("reports a sensor that another slot has, before the check of the sensor itself", () => {
    const taken = new Map([["sensor.oven", "Küche"]]);
    const errors = fieldErrors({ entity: "sensor.oven" }, fields, states, getPath, undefined, taken);
    expect(errors.entity).toMatch(/Küche/);
  });
  it("reports nothing for a free sensor", () => {
    expect(fieldErrors({ entity: "sensor.oven" }, fields, states, getPath, undefined, new Map()).entity).toBeUndefined();
  });
});
