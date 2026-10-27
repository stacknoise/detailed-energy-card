import { describe, expect, it } from "vitest";
import { ConfigError } from "../src/model/config";
import type { EnergyRow } from "../src/model/energy";
import { costliestHour, heatLevel, heatmapGrid, peakHour, validateHeatmapConfig } from "../src/model/heatmap";

const H = 3_600_000;
const TZ = "Europe/Berlin";
// local midnights (UTC+2) of 12 and 13 October 2026
const D1 = Date.parse("2026-10-11T22:00:00Z");
const D2 = D1 + 24 * H;
const day = (start: number, wh: (h: number) => number | undefined): EnergyRow[] =>
  Array.from({ length: 24 }, (_, h) => [h, wh(h)] as const).filter(([, v]) => v !== undefined).map(([h, v]) => ({ start: start + h * H, wh: v! }));

describe("heatmap grid", () => {
  it("has a row per day and a column per local hour", () => {
    const g = heatmapGrid([...day(D1, (h) => h), ...day(D2, (h) => 100 + h)], [D1, D2], TZ, D2 + 30 * H);
    expect(g.days).toHaveLength(2);
    expect(g.days[0].cells.slice(0, 3)).toEqual([0, 1, 2]);
    expect(g.days[1].cells[23]).toBe(123);
    expect(g.max).toBe(123);
  });

  it("shows an hour without a row as missing, not as 0, but a row of 0 as 0", () => {
    const g = heatmapGrid(day(D1, (h) => (h === 5 ? undefined : h === 6 ? 0 : 10)), [D1], TZ, D1 + 48 * H);
    expect(g.days[0].cells[5]).toBe("missing");
    expect(g.days[0].cells[6]).toBe(0);
  });

  it("marks the hours of today that have not begun as future, not as missing", () => {
    // 10:30 local on the second day
    const now = D2 + 10.5 * H;
    const g = heatmapGrid([...day(D1, () => 1), ...day(D2, (h) => (h <= 10 ? 2 : undefined))], [D1, D2], TZ, now);
    expect(g.days[1].cells[9]).toBe(2);
    expect(g.days[1].cells[10]).toBe(2);
    expect(g.days[1].cells[11]).toBe("future");
    expect(g.days[0].cells[23]).toBe(1);
  });

  it("leaves the hour that clocks skip missing and adds up the hour that clocks repeat", () => {
    // 29 March 2026: 02:00 does not exist (23 hours); 25 October 2026: 02:00 happens twice (25 hours)
    const spring = Date.parse("2026-03-28T23:00:00Z");
    const springRows = Array.from({ length: 23 }, (_, i) => ({ start: spring + i * H, wh: 10 }));
    const g1 = heatmapGrid(springRows, [spring], TZ, spring + 48 * H);
    expect(g1.days[0].cells[2]).toBe("missing");
    expect(g1.days[0].cells.filter((c) => c === 10)).toHaveLength(23);
    const autumn = Date.parse("2026-10-24T22:00:00Z");
    const autumnRows = Array.from({ length: 25 }, (_, i) => ({ start: autumn + i * H, wh: 10 }));
    const g2 = heatmapGrid(autumnRows, [autumn], TZ, autumn + 48 * H);
    expect(g2.days[0].cells[2]).toBe(20);
    expect(g2.days[0].cells.every((c) => typeof c === "number")).toBe(true);
  });

  it("ignores rows before the first day and has max 0 without numbers", () => {
    const g = heatmapGrid([{ start: D1 - H, wh: 99 }], [D1], TZ, D1 + 48 * H);
    expect(g.max).toBe(0);
    expect(g.days[0].cells.every((c) => c === "missing")).toBe(true);
  });

  it("maps a cell to a level between 0 and 1", () => {
    expect(heatLevel(50, 100)).toBe(0.5);
    expect(heatLevel(200, 100)).toBe(1);
    expect(heatLevel(-5, 100)).toBe(0);
    expect(heatLevel(5, 0)).toBe(0);
  });
});

describe("peak and most expensive hour", () => {
  const rows: EnergyRow[] = [
    { start: 0, wh: 1200 }, // 07:00 morning, expensive hour
    { start: H, wh: 400 },
    { start: 2 * H, wh: 2000 }, // the largest, but cheap
  ];

  it("finds the hour with the largest consumption", () => {
    expect(peakHour(rows)?.start).toBe(2 * H);
    expect(peakHour([{ start: 0, wh: 0 }])).toBeUndefined();
  });

  it("multiplies the consumption of every hour with the price of that hour", () => {
    const prices: EnergyRow[] = [{ start: 0, wh: 0.38 }, { start: H, wh: 0.3 }, { start: 2 * H, wh: 0.19 }];
    const r = costliestHour(rows, { rows: prices }, 3 * H)!;
    // 1,2 kWh x 0,38 = 0,456 beats 2,0 kWh x 0,19 = 0,38
    expect(r.start).toBe(0);
    expect(r.cost).toBeCloseTo(0.456, 6);
  });

  it("takes a fixed price for every hour, so the largest consumption costs most", () => {
    expect(costliestHour(rows, { fixed: 0.3 }, 3 * H)?.start).toBe(2 * H);
  });

  it("has no answer without a price", () => {
    expect(costliestHour(rows, {}, 3 * H)).toBeUndefined();
    expect(costliestHour(rows, { rows: [] }, 3 * H)).toBeUndefined();
  });
});

describe("heatmap configuration", () => {
  const base = { type: "custom:detailed-energy-heatmap-card", entity: "sensor.haus_energie" };
  const rejects = (cfg: Record<string, unknown>, message: RegExp) => {
    expect(() => validateHeatmapConfig({ ...base, ...cfg })).toThrow(ConfigError);
    expect(() => validateHeatmapConfig({ ...base, ...cfg })).toThrow(message);
  };

  it("needs an energy sensor", () => {
    rejects({ entity: undefined }, /entity/);
    rejects({ entity: "light.kitchen" }, /entity/);
    expect(() => validateHeatmapConfig(base)).not.toThrow();
  });

  it.each([6, 29, 7.5, "7"])("rejects days %s", (days) => rejects({ days }, /days/));
  it.each([7, 14, 28])("accepts days %s", (days) => expect(() => validateHeatmapConfig({ ...base, days })).not.toThrow());

  it("checks the price options like the main card does", () => {
    rejects({ price: -1 }, /price/);
    rejects({ price: 0.3, price_entity: "sensor.p" }, /not both/);
    rejects({ currency: "euro" }, /currency/);
    expect(() => validateHeatmapConfig({ ...base, price_entity: "sensor.p", currency: "EUR", title: "x" })).not.toThrow();
  });
});
