import { describe, expect, it } from "vitest";
import { computeModel, type Reader } from "../src/model/compute";
import { ConfigError, collectEnergyIds, collectEntityIds, validateConfig } from "../src/model/config";
import type { EnergyRow } from "../src/model/energy";
import { treeSeries } from "../src/model/timeline";

const H = 3600_000;
const starts = [0, H, 2 * H];
const rows = (...wh: number[]): EnergyRow[] => wh.map((v, i) => ({ start: i * H, wh: v }));
const reader = (values: Record<string, number>): Reader => (id) => (id in values ? { watts: values[id], valid: true } : { watts: 0, valid: false });

const cfg = validateConfig({
  type: "x",
  consumers: [
    { name: "Leiste", entity: "sensor.strip", energy_entity: "sensor.strip_e", minus_entities: ["sensor.tv", "sensor.lamp"], minus_energy_entities: ["sensor.tv_e"] },
    { entity: "sensor.tv", energy_entity: "sensor.tv_e" },
    { entity: "sensor.lamp" },
  ],
});

describe("difference consumers", () => {
  it("take the readable sensors off the value and never go below 0", () => {
    const m = computeModel(cfg, reader({ "sensor.strip": 300, "sensor.tv": 120, "sensor.lamp": 30 }));
    expect(m.consumers[0].watts).toBe(150);
    expect(computeModel(cfg, reader({ "sensor.strip": 100, "sensor.tv": 120, "sensor.lamp": 30 })).consumers[0].watts).toBe(0);
    // a sensor that cannot be read is left out
    expect(computeModel(cfg, reader({ "sensor.strip": 300, "sensor.tv": 120 })).consumers[0].watts).toBe(180);
  });
  it("work in the energy mode with the energy counters", () => {
    const m = computeModel(cfg, reader({ "sensor.strip_e": 1000, "sensor.tv_e": 400 }), undefined, undefined, true);
    expect(m.consumers[0].watts).toBe(600);
  });
  it("have the hours of the counters taken off in the timeline", () => {
    const data = new Map([
      ["sensor.strip_e", rows(500, 300, 100)],
      ["sensor.tv_e", rows(200, 400, 50)],
    ]);
    expect(treeSeries(cfg, data, starts, 3 * H).consumers.get("sensor.strip")).toEqual([300, 0, 50]);
  });
  it("are watched and requested with their sensors, and must be lists of entity ids", () => {
    expect(collectEntityIds(cfg)).toEqual(expect.arrayContaining(["sensor.tv", "sensor.lamp"]));
    expect(collectEnergyIds(cfg)).toContain("sensor.tv_e");
    expect(() => validateConfig({ type: "x", consumers: [{ entity: "sensor.a", minus_entities: "sensor.b" }] })).toThrow(ConfigError);
  });
});

describe("grid tariffs in the config", () => {
  it("are for grid sources only, a number or a sensor, and a general price is optional with them", async () => {
    const { hasPrice } = await import("../src/model/config");
    const base = { type: "x", rooms: [] };
    expect(() => validateConfig({ ...base, sources: [{ entity: "sensor.pv", type: "solar", price: 0.2 }] })).toThrow(/only for the type grid/);
    expect(() => validateConfig({ ...base, sources: [{ entity: "sensor.g", type: "grid", price: 0.2, price_entity: "sensor.p" }] })).toThrow(/not both/);
    const own = validateConfig({ ...base, sources: [{ entity: "sensor.g", type: "grid", energy_entity: "sensor.ge", price: 0.2 }] });
    expect(hasPrice(own)).toBe(true);
    expect(hasPrice(validateConfig({ ...base, sources: [{ entity: "sensor.g", type: "grid", energy_entity: "sensor.ge" }] }))).toBe(false);
  });
});
