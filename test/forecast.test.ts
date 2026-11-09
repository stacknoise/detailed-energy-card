import { describe, expect, it } from "vitest";
import { validateConfig } from "../src/model/config";
import { forecastBars, parseSolarForecast } from "../src/model/forecast";

const H = 3_600_000;
const day = Date.UTC(2026, 9, 13, 0);
const iso = (t: number) => new Date(t).toISOString();

describe("parseSolarForecast", () => {
  it("adds up the hours of all entries", () => {
    const m = parseSolarForecast({
      a: { wh_hours: { [iso(day + 10 * H)]: 500, [iso(day + 11 * H)]: 800 } },
      b: { wh_hours: { [iso(day + 10 * H)]: 100 } },
    });
    expect(m.get(day + 10 * H)).toBe(600);
    expect(m.get(day + 11 * H)).toBe(800);
  });
  it("takes the start of the hour, also for a time stamp with an offset", () => {
    const m = parseSolarForecast({ a: { wh_hours: { "2026-10-13T12:00:00+02:00": 300 } } });
    expect(m.get(Date.UTC(2026, 9, 13, 10))).toBe(300);
  });
  it("skips what cannot be read", () => {
    expect(parseSolarForecast(undefined).size).toBe(0);
    expect(parseSolarForecast({ a: null, b: { wh_hours: "x" }, c: { wh_hours: { nope: 5, [iso(day)]: "7", [iso(day + H)]: -4 } } }).get(day + H)).toBe(0);
    expect(parseSolarForecast({ c: { wh_hours: { nope: 5, [iso(day)]: "7" } } }).size).toBe(0);
  });
});

describe("forecastBars", () => {
  const hours = new Map([[day + 10 * H, 500], [day + 11 * H, 800]]);
  it("gives hourly bars their hour and leaves the others undefined", () => {
    const starts = [day + 9 * H, day + 10 * H, day + 11 * H, day + 12 * H];
    expect(forecastBars(hours, starts, day + 13 * H)).toEqual([undefined, 500, 800, undefined]);
  });
  it("sums the hours of a day bar", () => {
    const starts = [day, day + 24 * H];
    // no night hours in the forecast: a day bar counts as soon as one of its hours is known
    expect(forecastBars(hours, starts, day + 48 * H)).toEqual([1300, undefined]);
    const full = new Map(Array.from({ length: 24 }, (_, h) => [day + h * H, 100] as const));
    expect(forecastBars(full, starts, day + 48 * H)).toEqual([2400, undefined]);
  });
  it("is empty without a forecast", () => {
    expect(forecastBars(new Map(), [day], day + H)).toEqual([undefined]);
  });
});

describe("option show_pv_forecast", () => {
  it("wants true or false", () => {
    const base = { type: "x", sources: [{ entity: "sensor.a", type: "solar" }] };
    expect(() => validateConfig({ ...base, options: { show_pv_forecast: true } })).not.toThrow();
    expect(() => validateConfig({ ...base, options: { show_pv_forecast: 1 } })).toThrow(/options\.show_pv_forecast must be true or false/);
  });
});
