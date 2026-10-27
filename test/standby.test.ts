import { describe, expect, it } from "vitest";
import type { EnergyCardConfig } from "../src/model/config";
import type { EnergyRow } from "../src/model/energy";
import { baseLoad, homePowerIds, homePowerRows, runsContinuously } from "../src/model/standby";

const H = 3_600_000;
const TZ = "Europe/Berlin";
// local midnight of 13 October 2026 (UTC+2)
const MIDNIGHT = Date.parse("2026-10-12T22:00:00Z");
const hourly = (watts: (h: number) => number, hours = 24, from = MIDNIGHT): EnergyRow[] =>
  Array.from({ length: hours }, (_, i) => ({ start: from + i * H, wh: watts(i % 24) }));

describe("base load", () => {
  it("is the lowest hourly mean between 1 and 5 o'clock, local time", () => {
    // 100 W at night, 400 W by day; the lowest hour overall (50 W at 12) does not count
    const rows = hourly((h) => (h === 12 ? 50 : h >= 1 && h < 5 ? 100 + h : 400));
    expect(baseLoad(rows, TZ)).toBe(101);
  });

  it("looks at the hours that begin at 1 to 4, not at 0 or 5", () => {
    expect(baseLoad(hourly((h) => (h === 0 || h === 5 ? 10 : 300)), TZ)).toBe(300);
  });

  it("takes the lowest of several nights and has no value without a night", () => {
    const nights = [
      ...hourly(() => 220, 24, MIDNIGHT),
      ...hourly((h) => (h === 3 ? 150 : 220), 24, MIDNIGHT + 24 * H),
    ];
    expect(baseLoad(nights, TZ)).toBe(150);
    expect(baseLoad([], TZ)).toBeUndefined();
    expect(baseLoad(hourly(() => 100, 1, MIDNIGHT + 12 * H), TZ)).toBeUndefined();
  });

  it("counts the night in the time zone, not in UTC", () => {
    // 01:00 local is 23:00 UTC of the day before
    const one = [{ start: Date.parse("2026-10-12T23:00:00Z"), wh: 90 }];
    expect(baseLoad(one, TZ)).toBe(90);
    expect(baseLoad(one, "UTC")).toBeUndefined();
  });
});

describe("power of the home", () => {
  const cfg: EnergyCardConfig = {
    type: "x",
    sources: [
      { entity: "sensor.pv", type: "solar" },
      { entity: "sensor.grid", type: "grid" },
      { entity: "sensor.bat", type: "battery", invert: true },
    ],
  };

  it("uses the sensor of the home when there is one", () => {
    const c = { ...cfg, home: { total_entity: "sensor.home" } };
    expect(homePowerIds(c)).toEqual(["sensor.home"]);
    const rows = homePowerRows(c, new Map([["sensor.home", [{ start: 0, wh: 300 }]]]));
    expect(rows).toEqual([{ start: 0, wh: 300 }]);
  });

  it("else adds the sources: grid and battery signed, solar never below 0, invert turns a sensor around", () => {
    expect(homePowerIds(cfg)).toEqual(["sensor.pv", "sensor.grid", "sensor.bat"]);
    const series = new Map<string, EnergyRow[]>([
      ["sensor.pv", [{ start: 0, wh: 1000 }, { start: H, wh: -5 }]],
      ["sensor.grid", [{ start: 0, wh: -300 }, { start: H, wh: 200 }]],
      ["sensor.bat", [{ start: 0, wh: -200 }, { start: H, wh: 0 }]],
    ]);
    // hour 0: 1000 - 300 + 200 (inverted battery) = 900; hour 1: 0 + 200 + 0
    expect(homePowerRows(cfg, series)).toEqual([{ start: 0, wh: 900 }, { start: H, wh: 200 }]);
  });

  it("leaves out an hour that one source is missing, and has nothing without sources or rows", () => {
    const series = new Map<string, EnergyRow[]>([
      ["sensor.pv", [{ start: 0, wh: 100 }, { start: H, wh: 100 }]],
      ["sensor.grid", [{ start: H, wh: 100 }]],
      ["sensor.bat", [{ start: 0, wh: 0 }, { start: H, wh: 0 }]],
    ]);
    expect(homePowerRows(cfg, series)).toEqual([{ start: H, wh: 200 }]);
    expect(homePowerRows({ type: "x" }, series)).toEqual([]);
    expect(homePowerRows(cfg, new Map())).toEqual([]);
  });
});

describe("standby", () => {
  it("runs all the time when no hour of the last day fell below the limit", () => {
    expect(runsContinuously(hourly(() => 12), 5)).toBe(true);
    expect(runsContinuously(hourly((h) => (h === 14 ? 2 : 12)), 5)).toBe(false);
  });

  it("counts the limit itself as running", () => {
    expect(runsContinuously(hourly(() => 5), 5)).toBe(true);
  });

  it("gives no verdict with too little data", () => {
    expect(runsContinuously(undefined, 5)).toBe(false);
    expect(runsContinuously([], 5)).toBe(false);
    expect(runsContinuously(hourly(() => 50, 19), 5)).toBe(false);
    expect(runsContinuously(hourly(() => 50, 20), 5)).toBe(true);
  });
});
