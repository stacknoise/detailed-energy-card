import { describe, expect, it } from "vitest";
import {
  findDuplicates,
  getPath,
  moveItem,
  setPath,
  toggleFloors,
  updateIn,
} from "../src/editor/config-utils";
import { configPaths, coveredPaths } from "../src/editor/schema";
import { validateConfig, type EnergyCardConfig } from "../src/model/config";

// A config that uses every documented option (concept, section 3).
const FULL: EnergyCardConfig = {
  type: "custom:energy-card",
  title: "Energiefluss",
  home: { name: "Zuhause", total_entity: "sensor.total" },
  sources: [
    { entity: "sensor.pv", name: "PV", type: "solar", icon: "mdi:solar-power", color: "#f2c94c", soc_entity: "sensor.soc", invert: false },
  ],
  floors: [
    {
      name: "EG",
      icon: "mdi:home",
      color: "#fff",
      rooms: [{ name: "Küche", icon: "mdi:stove", color: "#fff", consumers: [{ entity: "sensor.a", name: "Backofen" }] }],
    },
  ],
  rooms: [{ name: "Bad", icon: "mdi:shower", color: "#fff", consumers: [{ entity: "sensor.b", name: "Boiler" }] }],
  colors: { preset: "custom", accent: "#1", flow: "#2", inactive: "#3", bar: "#4", background: "#5", text: "#6" },
  options: { unit: "auto", decimals: 2, animation: true, show_unassigned: true, remember_selection: true },
};

describe("editor coverage", () => {
  it("has a field for every config key", () => {
    const keys = configPaths(FULL).filter((p) => p !== "type");
    const covered = new Set(coveredPaths());
    expect(keys.filter((k) => !covered.has(k))).toEqual([]);
  });
  it("covers no key the config does not know", () => {
    const known = new Set(configPaths(FULL));
    expect(coveredPaths().filter((p) => !known.has(p))).toEqual([]);
  });
  it("full sample config is itself valid", () => {
    expect(() => validateConfig({ ...FULL, rooms: undefined })).not.toThrow();
  });
});

describe("config utils", () => {
  it("getPath/setPath handle dotted paths immutably", () => {
    const a = { title: "x" };
    const b = setPath(a, "options.unit", "kW");
    expect(b).toEqual({ title: "x", options: { unit: "kW" } });
    expect(a).toEqual({ title: "x" });
    expect(getPath(b, "options.unit")).toBe("kW");
  });
  it("empty values remove the key and prune empty parents", () => {
    const cfg = { options: { unit: "kW" }, title: "t" };
    expect(setPath(cfg, "options.unit", "")).toEqual({ title: "t" });
    expect(setPath(cfg, "title", undefined)).toEqual({ options: { unit: "kW" } });
  });
  it("keeps false booleans", () => {
    expect(setPath({}, "options.animation", false)).toEqual({ options: { animation: false } });
  });
  it("updateIn edits nested list items", () => {
    const cfg = updateIn(FULL, ["floors", 0, "rooms", 0, "consumers"], (l) => [...l, { entity: "sensor.c" }]);
    expect(cfg.floors![0].rooms![0].consumers).toHaveLength(2);
    expect(FULL.floors![0].rooms![0].consumers).toHaveLength(1);
  });
  it("moveItem stays inside bounds", () => {
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
  });
  it("toggleFloors moves rooms between levels", () => {
    const flat: EnergyCardConfig = { type: "x", rooms: [{ name: "K" }] };
    const withFloors = toggleFloors(flat, true);
    expect(withFloors.rooms).toBeUndefined();
    expect(withFloors.floors![0].rooms).toEqual([{ name: "K" }]);
    const back = toggleFloors({ type: "x", floors: [{ name: "EG", rooms: [{ name: "A" }] }, { name: "OG", rooms: [{ name: "B" }] }] }, false);
    expect(back.floors).toBeUndefined();
    expect(back.rooms!.map((r) => r.name)).toEqual(["A", "B"]);
  });
  it("finds duplicate assignments", () => {
    const cfg: EnergyCardConfig = {
      type: "x",
      rooms: [
        { name: "A", consumers: [{ entity: "sensor.x" }] },
        { name: "B", consumers: [{ entity: "sensor.x" }, { entity: "sensor.y" }] },
      ],
    };
    expect(findDuplicates(cfg)).toEqual([{ entity: "sensor.x", places: ["A", "B"] }]);
  });
});
