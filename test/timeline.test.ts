import { describe, expect, it } from "vitest";
import type { EnergyCardConfig } from "../src/model/config";
import type { EnergyRow } from "../src/model/energy";
import {
  bucketStarts,
  bucketize,
  compareWithPrevious,
  comparisonDayBack,
  peakIndex,
  periodBounds,
  treeSeries,
} from "../src/model/timeline";

const BERLIN = "Europe/Berlin";
const H = 3_600_000;
const iso = (t: number) => new Date(t).toISOString();

describe("bars of the timeline", () => {
  it("has 24 hours on a normal day, 23 and 25 on the days of a clock change", () => {
    const day = (d: string) => {
      const { start, end } = periodBounds("today", new Date(d), BERLIN);
      return bucketStarts(start, end, "hour", BERLIN);
    };
    expect(day("2026-10-13T10:00:00Z")).toHaveLength(24);
    expect(day("2026-03-29T10:00:00Z")).toHaveLength(23);
    expect(day("2026-10-25T10:00:00Z")).toHaveLength(25);
  });

  it("has one bar per day of a week or a month, starting at local midnight", () => {
    const now = new Date("2026-10-13T12:00:00Z");
    const week = periodBounds("week", now, BERLIN, 1);
    const days = bucketStarts(week.start, week.end, "day", BERLIN);
    expect(days).toHaveLength(7);
    expect(iso(days[0])).toBe("2026-10-11T22:00:00.000Z");
    const march = periodBounds("month", new Date("2026-03-10T12:00:00Z"), BERLIN);
    const m = bucketStarts(march.start, march.end, "day", BERLIN);
    expect(m).toHaveLength(31);
    // the day after the clock change starts at +02:00
    expect(iso(m[29])).toBe("2026-03-29T22:00:00.000Z");
  });

  it("sums the rows into their bars and leaves out what lies outside", () => {
    const starts = [0, H, 2 * H];
    const rows: EnergyRow[] = [
      { start: 0, wh: 100 },
      { start: H, wh: 50 },
      { start: H + 1, wh: 5 },
      { start: 3 * H, wh: 999 },
      { start: -H, wh: 999 },
    ];
    expect(bucketize(rows, starts, 3 * H)).toEqual([100, 55, 0]);
  });
});

describe("values per floor, room and consumer", () => {
  const cfg: EnergyCardConfig = {
    type: "x",
    home: { total_energy_entity: "sensor.total" },
    floors: [
      {
        floor_id: "eg",
        energy_entity: "sensor.eg",
        rooms: [
          { area_id: "kueche", consumers: [{ entity: "sensor.ofen", energy_entity: "sensor.ofen_e" }, { entity: "sensor.kaffee" }] },
          { area_id: "flur", energy_entity: "sensor.flur" },
        ],
      },
      { floor_id: "og", rooms: [{ area_id: "bad", consumers: [{ entity: "sensor.boiler", energy_entity: "sensor.boiler_e" }] }] },
      { floor_id: "keller", rooms: [{ area_id: "werk", consumers: [{ entity: "sensor.saege" }] }] },
    ],
  };
  const starts = [0, H];
  const row = (a: number, b: number): EnergyRow[] => [{ start: 0, wh: a }, { start: H, wh: b }];
  const rows = new Map<string, EnergyRow[]>([
    ["sensor.ofen_e", row(100, 200)],
    ["sensor.flur", row(5, 5)],
    ["sensor.boiler_e", row(300, 0)],
    ["sensor.eg", row(150, 250)],
  ]);
  const s = treeSeries(cfg, rows, starts, 2 * H);

  it("takes consumers from their counters and leaves the ones without one out", () => {
    expect(s.consumers.get("sensor.ofen")).toEqual([100, 200]);
    expect(s.consumers.get("sensor.kaffee")).toBeUndefined();
  });

  it("uses own meters, else the sum of the children", () => {
    expect(s.rooms.get("kueche")).toEqual([100, 200]);
    expect(s.rooms.get("flur")).toEqual([5, 5]);
    expect(s.floors.get("eg")).toEqual([150, 250]);
    expect(s.floors.get("og")).toEqual([300, 0]);
    expect(s.floors.get("keller")).toBeUndefined();
  });

  it("falls back to the sum when the home counter has no statistics", () => {
    expect(s.home).toEqual([450, 250]);
    const withTotal = treeSeries(cfg, new Map([...rows, ["sensor.total", row(500, 260)]]), starts, 2 * H);
    expect(withTotal.home).toEqual([500, 260]);
  });
});

describe("comparison with the previous period", () => {
  it("compares today with yesterday up to the same full hour", () => {
    const starts = Array.from({ length: 24 }, (_, i) => i * H);
    const prevStarts = Array.from({ length: 24 }, (_, i) => -24 * H + i * H);
    const values = starts.map((_, i) => (i < 19 ? 100 : 0));
    const prevValues = prevStarts.map(() => 80);
    // 19:40: 19 full hours on both days
    const r = compareWithPrevious({ unit: "hour", now: 19 * H + 40 * 60_000, starts, values, prevStarts, prevValues });
    expect(r.current).toBe(1900);
    expect(r.previous).toBe(19 * 80);
    expect(r.change).toBeCloseTo(1900 / 1520 - 1);
  });

  it("compares a week with the full days of the last one and today up to the same hour of its day", () => {
    const D = 24 * H;
    const starts = Array.from({ length: 7 }, (_, i) => i * D);
    const prevStarts = starts.map((t) => t - 7 * D);
    // Wednesday (index 2), 10:30
    const now = 2 * D + 10.5 * H;
    const values = [1000, 1200, 400, 0, 0, 0, 0];
    const prevValues = [900, 1100, 2000, 1000, 1000, 1000, 1000];
    const dayStarts = Array.from({ length: 24 }, (_, i) => 2 * D - 7 * D + i * H);
    const dayValues = dayStarts.map(() => 50);
    const r = compareWithPrevious({ unit: "day", now, starts, values, prevStarts, prevValues, dayStarts, dayValues });
    expect(r.current).toBe(2600);
    expect(r.previous).toBe(900 + 1100 + 10 * 50);
  });

  it("gives no share when the previous period used nothing", () => {
    expect(compareWithPrevious({ unit: "hour", now: 2 * H, starts: [0, H], values: [1, 1], prevStarts: [-2 * H, -H], prevValues: [0, 0] }).change).toBeNull();
  });

  it("knows which day today is compared with", () => {
    expect(comparisonDayBack("today", new Date("2026-10-13T12:00:00Z"), BERLIN)).toBe(1);
    expect(comparisonDayBack("week", new Date("2026-10-13T12:00:00Z"), BERLIN)).toBe(7);
    // 13 October against 13 September
    expect(comparisonDayBack("month", new Date("2026-10-13T12:00:00Z"), BERLIN)).toBe(30);
    // 31 March against 28 February, the last day of the shorter month
    expect(comparisonDayBack("month", new Date("2026-03-31T12:00:00Z"), BERLIN)).toBe(31);
  });

  it("finds the peak", () => {
    expect(peakIndex([0, 3, 5, 5, 1])).toBe(2);
    expect(peakIndex([0, 0])).toBe(-1);
  });
});

describe("comparison of a period that is over", () => {
  it("compares the whole period with the whole previous one, whatever the time is", () => {
    const starts = [0, 1, 2].map((i) => i * 86_400_000);
    const r = compareWithPrevious({ unit: "day", now: 3 * 86_400_000, starts, values: [10, 20, 30], prevStarts: starts, prevValues: [10, 10, 10, 10], whole: true });
    expect(r).toEqual({ current: 60, previous: 40, change: 0.5 });
  });
});
