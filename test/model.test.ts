import { describe, expect, it } from "vitest";
import { computeModel, type Reader } from "../src/model/compute";
import { collectEntityIds, ConfigError, validateConfig } from "../src/model/config";
import { formatPower, stateToWatts } from "../src/model/units";
import { computeLayout, flowDuration } from "../src/view/layout";

const reader = (values: Record<string, number>): Reader => (id) =>
  id in values ? { watts: values[id], valid: true } : { watts: 0, valid: false };

describe("units", () => {
  it("converts kW and MW to W", () => {
    expect(stateToWatts({ state: "1.5", attributes: { unit_of_measurement: "kW" } })).toBe(1500);
    expect(stateToWatts({ state: "2", attributes: { unit_of_measurement: "MW" } })).toBe(2_000_000);
  });
  it("rejects unavailable, unknown units and undefined", () => {
    expect(stateToWatts({ state: "unavailable", attributes: {} })).toBeNull();
    expect(stateToWatts({ state: "5", attributes: { unit_of_measurement: "V" } })).toBeNull();
    expect(stateToWatts(undefined)).toBeNull();
  });
  it("formats power", () => {
    expect(formatPower(3420, "auto", 2, "en")).toBe("3.42 kW");
    expect(formatPower(420, "auto", 2, "en")).toBe("420 W");
    expect(formatPower(0.4)).toBe("0 W");
    expect(formatPower(500, "kW", 2, "en")).toBe("0.50 kW");
  });
});

describe("config", () => {
  it("rejects floors and rooms together", () => {
    expect(() => validateConfig({ type: "x", floors: [{ name: "EG" }], rooms: [{ name: "K" }] })).toThrow(ConfigError);
  });
  it("rejects non-sensor entities", () => {
    expect(() => validateConfig({ type: "x", sources: [{ entity: "light.a" }] })).toThrow(ConfigError);
  });
  it("collects entity ids without duplicates", () => {
    const cfg = validateConfig({
      type: "x",
      home: { total_entity: "sensor.total" },
      sources: [{ entity: "sensor.bat", type: "battery", soc_entity: "sensor.soc" }],
      rooms: [{ name: "K", consumers: [{ entity: "sensor.a" }, { entity: "sensor.a" }] }],
    });
    expect(collectEntityIds(cfg).sort()).toEqual(["sensor.a", "sensor.bat", "sensor.soc", "sensor.total"]);
  });
});

describe("compute", () => {
  const cfg = validateConfig({
    type: "x",
    home: { total_entity: "sensor.total" },
    sources: [
      { entity: "sensor.pv", type: "solar" },
      { entity: "sensor.grid", type: "grid" },
      { entity: "sensor.bat", type: "battery", soc_entity: "sensor.soc" },
    ],
    floors: [{ name: "EG", rooms: [{ name: "K", consumers: [{ entity: "sensor.a" }, { entity: "sensor.b" }] }] }],
  });

  it("sums consumers, rooms and floors; total drives unassigned", () => {
    const m = computeModel(cfg, reader({ "sensor.pv": 3000, "sensor.grid": 500, "sensor.bat": 0, "sensor.total": 3500, "sensor.a": 800, "sensor.b": 200 }));
    expect(m.floors[0].rooms[0].watts).toBe(1000);
    expect(m.floors[0].watts).toBe(1000);
    expect(m.homeWatts).toBe(3500);
    expect(m.unassigned).toBe(2500);
    expect(m.autarky).toBeCloseTo(1 - 500 / 3500);
  });

  it("falls back to room sum without total sensor", () => {
    const m = computeModel(cfg, reader({ "sensor.a": 800, "sensor.b": 200 }));
    expect(m.homeWatts).toBe(1000);
    expect(m.unassigned).toBe(0);
  });

  it("treats invalid readings as 0 and marks them", () => {
    const m = computeModel(cfg, reader({ "sensor.a": 800 }));
    expect(m.floors[0].rooms[0].consumers.find((c) => c.entity === "sensor.b")).toMatchObject({ watts: 0, valid: false });
  });

  it("handles signs: solar clipped, battery charge and grid export reversed", () => {
    const m = computeModel(cfg, reader({ "sensor.pv": -50, "sensor.grid": -700, "sensor.bat": -300, "sensor.soc": 76 }));
    const [pv, grid, bat] = m.sources;
    expect(pv.watts).toBe(0);
    expect(grid).toMatchObject({ watts: -700, reverse: true });
    expect(bat).toMatchObject({ watts: -300, reverse: true, soc: 76 });
  });

  it("invert flips the sign", () => {
    const c = validateConfig({ type: "x", sources: [{ entity: "sensor.g", type: "grid", invert: true }] });
    expect(computeModel(c, reader({ "sensor.g": 400 })).sources[0].watts).toBe(-400);
  });

  it("computes source shares", () => {
    const m = computeModel(cfg, reader({ "sensor.pv": 750, "sensor.grid": 250, "sensor.bat": 0 }));
    expect(m.sources[0].share).toBeCloseTo(0.75);
  });
});

describe("layout", () => {
  it("places rows per the concept", () => {
    const l = computeLayout({ width: 300, sources: 3, floors: 3, rooms: 3 });
    expect([l.yHome, l.yFloor, l.yRoom]).toEqual([124, 226, 300]);
    expect(l.sourceXs).toEqual([50, 150, 250]);
    const flat = computeLayout({ width: 300, sources: 2, floors: 0, rooms: 5 });
    expect(flat.yRoom).toBe(226);
  });
  it("keeps 64px columns for many rooms", () => {
    expect(computeLayout({ width: 300, sources: 1, floors: 0, rooms: 10 }).width).toBe(640);
  });
  it("animation duration is clamped and absent without power", () => {
    expect(flowDuration(0)).toBeNull();
    expect(flowDuration(100)).toBeCloseTo(2.15);
    expect(flowDuration(10_000)).toBe(0.5);
  });
});
