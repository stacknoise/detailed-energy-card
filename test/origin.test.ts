import { describe, expect, it } from "vitest";
import { nodeKey } from "../src/model/compute";
import { validateConfig, type EnergyCardConfig } from "../src/model/config";
import type { EnergyRow } from "../src/model/energy";
import { BEST_HOURS, bestWindow, computeOrigin, originKinds } from "../src/model/origin";

const H = 3600_000;
const day = Date.UTC(2026, 9, 13, 0);
const starts = Array.from({ length: 24 }, (_, h) => day + h * H);
const end = day + 24 * H;
const rows = (f: (h: number) => number): EnergyRow[] => starts.map((start, h) => ({ start, wh: f(h) }));

const cfg: EnergyCardConfig = {
  type: "x",
  home: { total_energy_entity: "sensor.e_home" },
  sources: [
    { entity: "sensor.pv", type: "solar", energy_entity: "sensor.e_pv" },
    { entity: "sensor.bat", type: "battery", energy_entity: "sensor.e_bat" },
    { entity: "sensor.grid", type: "grid", energy_entity: "sensor.e_grid" },
  ],
  consumers: [{ entity: "sensor.oven", energy_entity: "sensor.e_oven" }, { entity: "sensor.fridge", energy_entity: "sensor.e_fridge" }],
};
// sun from 10 to 15 o'clock (1000 Wh an hour), battery 18 to 21, the grid the rest; the home takes 500 Wh an hour
const data = new Map([
  ["sensor.e_pv", rows((h) => (h >= 10 && h < 15 ? 1000 : 0))],
  ["sensor.e_bat", rows((h) => (h >= 18 && h < 21 ? 300 : 0))],
  ["sensor.e_grid", rows((h) => (h >= 10 && h < 15 ? 0 : h >= 18 && h < 21 ? 200 : 500))],
  ["sensor.e_home", rows(() => 500)],
  // the oven runs only at noon, the fridge all day
  ["sensor.e_oven", rows((h) => (h === 12 ? 400 : 0))],
  ["sensor.e_fridge", rows(() => 100)],
]);
const compute = (c = cfg, r = data) => computeOrigin({ cfg: c, rows: r, starts, end, timeZone: "UTC" })!;

describe("originKinds", () => {
  it("needs energy counters of at least two kinds of sources", () => {
    expect(originKinds(cfg)).toEqual(["solar", "battery", "grid"]);
    expect(originKinds({ type: "x", sources: [{ entity: "sensor.g", type: "grid", energy_entity: "sensor.e_g" }] })).toEqual([]);
    expect(originKinds({ type: "x", sources: [{ entity: "sensor.p", type: "solar" }, { entity: "sensor.g", type: "grid", energy_entity: "sensor.e_g" }] })).toEqual([]);
  });
});

describe("computeOrigin", () => {
  it("gives a node the share of every hour: the oven at noon runs on solar only", () => {
    const o = compute().nodes.get(nodeKey.consumer("sensor.oven"))!;
    expect(o.share.solar).toBe(1);
    expect(o.share.grid).toBe(0);
    expect(o.wh.solar).toBeCloseTo(400);
  });
  it("splits a node that runs all day across the hours", () => {
    const o = compute().nodes.get(nodeKey.consumer("sensor.fridge"))!;
    // delivered: solar 5000, battery 900, grid 5·0 + 3·200 + 16·500 = 8600 → about 34 % grid for the hours with delivery
    expect(o.share.solar + o.share.battery + o.share.grid).toBeCloseTo(1);
    expect(o.share.grid).toBeGreaterThan(0.5);
    expect(o.share.solar).toBeGreaterThan(0.1);
  });
  it("covers the home and leaves out nodes without rows", () => {
    const r = compute();
    expect(r.nodes.has(nodeKey.home)).toBe(true);
    const lone = compute({ ...cfg, consumers: [{ entity: "sensor.x", energy_entity: "sensor.e_x" }] });
    expect(lone.nodes.has(nodeKey.consumer("sensor.x"))).toBe(false);
  });
  it("is undefined without two kinds or without any delivery", () => {
    expect(computeOrigin({ cfg: { type: "x", sources: [{ entity: "sensor.g", type: "grid", energy_entity: "sensor.e_g" }] }, rows: data, starts, end, timeZone: "UTC" })).toBeUndefined();
    expect(computeOrigin({ cfg, rows: new Map(), starts, end, timeZone: "UTC" })).toBeUndefined();
  });
  it("finds the hours with the least grid power", () => {
    const best = compute().best!;
    expect(best.gridShare).toBe(0);
    // the sun shines from 10 to 15: the first window with no grid starts at 10
    expect(best.fromHour).toBe(10);
  });
});

describe("bestWindow", () => {
  it("adds up the same hours of several days and skips hours without delivery", () => {
    const two = [...starts, ...starts.map((t) => t + 24 * H)];
    const total = two.map((_, i) => (i % 24 >= 8 && i % 24 < 12 ? 1000 : 0));
    const grid = two.map((_, i) => (i % 24 === 8 ? 600 : i % 24 === 9 ? 300 : 0));
    const home = total.map((v) => v / 2);
    const b = bestWindow(home, grid, total, two, "UTC")!;
    expect(b.fromHour).toBe(9);
    expect(b.gridShare).toBeCloseTo(300 / 3000);
  });
  it("is undefined with too little consumption", () => {
    const total = starts.map((_, h) => (h < 4 ? 10 : 0));
    expect(bestWindow(total.map(() => 1), total.map(() => 5), total, starts, "UTC")).toBeUndefined();
    expect(BEST_HOURS).toBe(3);
  });
});

describe("option show_origin", () => {
  it("wants true or false", () => {
    const base = { type: "x", sources: [{ entity: "sensor.a", type: "grid" }] };
    expect(() => validateConfig({ ...base, options: { show_origin: true } })).not.toThrow();
    expect(() => validateConfig({ ...base, options: { show_origin: "yes" } })).toThrow(/options\.show_origin must be true or false/);
  });
});
