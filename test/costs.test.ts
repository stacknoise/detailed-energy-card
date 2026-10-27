import { describe, expect, it } from "vitest";
import { nodeKey } from "../src/model/compute";
import type { EnergyCardConfig } from "../src/model/config";
import type { EnergyRow } from "../src/model/energy";
import { computeCosts, hourlyPrices } from "../src/model/costs";

const H = 3_600_000;
const hours = (n: number) => Array.from({ length: n }, (_, i) => i * H);
const rows = (...wh: number[]): EnergyRow[] => wh.map((v, i) => ({ start: i * H, wh: v }));

const CFG: EnergyCardConfig = {
  type: "x",
  home: { total_energy_entity: "sensor.home" },
  sources: [
    { entity: "sensor.pv", energy_entity: "sensor.pv_e", type: "solar" },
    { entity: "sensor.grid", energy_entity: "sensor.grid_in", energy_entity_return: "sensor.grid_out", type: "grid" },
  ],
  rooms: [
    { area_id: "kueche", consumers: [{ entity: "sensor.ofen", energy_entity: "sensor.ofen_e" }] },
    { area_id: "bad", consumers: [{ entity: "sensor.boiler", energy_entity: "sensor.boiler_e" }] },
  ],
};

describe("hourly prices", () => {
  it("uses a fixed price for every hour", () => {
    expect(hourlyPrices({ fixed: 0.3 }, hours(3), 3 * H, 3 * H)).toEqual({ prices: [0.3, 0.3, 0.3], approx: false });
  });

  it("takes the hourly means of a price sensor and carries the last one over hours without a value", () => {
    const r = hourlyPrices({ rows: [{ start: H, wh: 0.4 }, { start: 3 * H, wh: 0.2 }] }, hours(5), 5 * H, 5 * H)!;
    // before the first value: the first one
    expect(r.prices).toEqual([0.4, 0.4, 0.4, 0.2, 0.2]);
    expect(r.approx).toBe(false);
  });

  it("is only approximate after more than 3 hours in a row without a price, counting the past only", () => {
    const starts = hours(8);
    expect(hourlyPrices({ rows: [{ start: 0, wh: 0.3 }] }, starts, 8 * H, 4 * H)!.approx).toBe(false);
    expect(hourlyPrices({ rows: [{ start: 0, wh: 0.3 }] }, starts, 8 * H, 5 * H)!.approx).toBe(true);
    expect(hourlyPrices({ rows: [{ start: 0, wh: 0.3 }, { start: 4 * H, wh: 0.3 }] }, starts, 8 * H, 8 * H)!.approx).toBe(false);
  });

  it("takes the last value before the period when it has none, and gives up without any", () => {
    expect(hourlyPrices({ rows: [{ start: -2 * H, wh: 0.25 }] }, hours(2), 2 * H, 2 * H)).toEqual({ prices: [0.25, 0.25], approx: false });
    expect(hourlyPrices({ rows: [] }, hours(2), 2 * H, 2 * H)).toBeUndefined();
    expect(hourlyPrices({}, hours(2), 2 * H, 2 * H)).toBeUndefined();
  });
});

describe("costs", () => {
  // hour 0: the home uses 2 kWh, 0.5 kWh from the grid (25 %), the kitchen 1 kWh; hour 1: everything from the grid
  const data = new Map<string, EnergyRow[]>([
    ["sensor.home", rows(2000, 1000)],
    ["sensor.grid_in", rows(500, 1000)],
    ["sensor.grid_out", rows(800, 0)],
    ["sensor.ofen_e", rows(1000, 400)],
    ["sensor.boiler_e", rows(600, 300)],
  ]);
  const costs = (price: number, extra: Partial<Parameters<typeof computeCosts>[0]> = {}) =>
    computeCosts({ cfg: CFG, rows: data, starts: hours(2), end: 2 * H, until: 2 * H, price: { fixed: price }, ...extra })!;

  it("charges every node its share from the grid, hour by hour (solar costs nothing)", () => {
    const c = costs(0.3);
    // kitchen: 1 kWh x 25 % x 0.30 + 0.4 kWh x 100 % x 0.30
    expect(c.nodes.get(nodeKey.consumer("sensor.ofen"))).toBeCloseTo(0.075 + 0.12);
    expect(c.nodes.get(nodeKey.room("kueche"))).toBeCloseTo(0.195);
    expect(c.fromGrid.get(nodeKey.room("kueche"))).toBeCloseTo(250 + 400);
    // the home: what came from the grid for it
    expect(c.nodes.get(nodeKey.home)).toBeCloseTo((500 + 1000) / 1000 * 0.3);
    expect(c.grid).toBeCloseTo(0.45);
    expect(c.nodes.get(nodeKey.source("sensor.grid"))).toBeCloseTo(0.45);
    expect(c.battery).toBe(0);
  });

  it("uses the price of each hour", () => {
    const c = costs(0, { price: { rows: [{ start: 0, wh: 0.38 }, { start: H, wh: 0.19 }] } });
    expect(c.nodes.get(nodeKey.consumer("sensor.ofen"))).toBeCloseTo(1 * 0.25 * 0.38 + 0.4 * 1 * 0.19);
  });

  it("caps the grid share at 100 % and books the rest as battery charging", () => {
    const charging = new Map(data);
    charging.set("sensor.grid_in", rows(3000, 1000));
    const c = computeCosts({ cfg: CFG, rows: charging, starts: hours(2), end: 2 * H, until: 2 * H, price: { fixed: 0.3 } })!;
    expect(c.nodes.get(nodeKey.consumer("sensor.ofen"))).toBeCloseTo(1 * 0.3 + 0.4 * 0.3);
    expect(c.battery).toBeCloseTo(1 * 0.3);
    // nodes of the home plus the battery make the whole grid import
    expect(c.nodes.get(nodeKey.home)! + c.battery).toBeCloseTo(c.grid);
  });

  it("makes the home the sum of the rooms plus what is unassigned", () => {
    const c = costs(0.3);
    const rooms = c.nodes.get(nodeKey.room("kueche"))! + c.nodes.get(nodeKey.room("bad"))!;
    // hour 0: 0.4 kWh unassigned x 25 %; hour 1: 0.3 kWh x 100 %
    const unassigned = (0.4 * 0.25 + 0.3) * 0.3;
    expect(rooms + unassigned).toBeCloseTo(c.nodes.get(nodeKey.home)!);
  });

  it("pays the feed-in with its own price", () => {
    expect(costs(0.3, { feedInPrice: { fixed: 0.08 } }).feedIn).toBeCloseTo(0.8 * 0.08);
    expect(costs(0.3).feedIn).toBeUndefined();
  });

  it("has no costs without a grid energy counter or without a price", () => {
    const noGrid: EnergyCardConfig = { ...CFG, sources: CFG.sources!.filter((s) => s.type !== "grid") };
    expect(computeCosts({ cfg: noGrid, rows: data, starts: hours(2), end: 2 * H, until: 2 * H, price: { fixed: 0.3 } })).toBeUndefined();
    expect(computeCosts({ cfg: CFG, rows: data, starts: hours(2), end: 2 * H, until: 2 * H, price: {} })).toBeUndefined();
  });

  it("marks the amount as approximate after a long gap in the prices", () => {
    const starts = hours(6);
    const c = computeCosts({ cfg: CFG, rows: data, starts, end: 6 * H, until: 6 * H, price: { rows: [{ start: 0, wh: 0.3 }] } })!;
    expect(c.approx).toBe(true);
  });
});
