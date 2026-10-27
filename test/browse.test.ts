import { describe, expect, it } from "vitest";
import { isoWeek, periodLabel } from "../src/model/browse";

const TZ = "Europe/Berlin";
// Tuesday 27 October 2026, 12:00 local time
const NOW = new Date("2026-10-27T11:00:00Z");
const text = { yesterday: "Gestern", week: (n: number) => `KW ${n}` };
const label = (period: "today" | "week" | "month", offset: number, lang = "de", now = NOW) =>
  periodLabel(period, offset, now, TZ, 1, lang, text);

describe("labels of the browsed period", () => {
  it("has none for the running period", () => {
    expect(label("today", 0)).toBeUndefined();
    expect(label("week", 0)).toBeUndefined();
    expect(label("month", 0)).toBeUndefined();
  });

  it("calls the day before yesterday, older days by weekday and date", () => {
    expect(label("today", -1)).toBe("Gestern");
    expect(label("today", -8)).toMatch(/^Mo\.?,? 19\.10\.$/);
    expect(label("today", -8, "en")).toMatch(/^Mon,? 10\/19$/);
  });

  it("numbers weeks like the calendar does", () => {
    expect(label("week", -1)).toBe("KW 43");
    expect(label("week", -2)).toBe("KW 42");
    expect(isoWeek(2026, 0, 1)).toBe(1);
    expect(isoWeek(2021, 0, 3)).toBe(53);
    expect(isoWeek(2024, 11, 30)).toBe(1);
  });

  it("names months and adds the year for another year", () => {
    expect(label("month", -1)).toBe("September");
    expect(label("month", -1, "en")).toBe("September");
    expect(label("month", -10)).toBe("Dezember 2025");
  });

  it("follows the first weekday: a week from Sunday belongs to the week of its middle day", () => {
    // week starting on Sunday 18 October: its middle is Wednesday 21 October, KW 43
    expect(periodLabel("week", -1, NOW, TZ, 0, "de", text)).toBe("KW 43");
    expect(periodLabel("week", -1, new Date("2026-10-28T11:00:00Z"), TZ, 0, "de", text)).toBe("KW 43");
  });

  it("counts a day at midnight in the time zone, not in UTC", () => {
    // 00:30 local on the 27th is still the 26th in UTC
    const late = new Date("2026-10-26T23:30:00Z");
    expect(label("today", -1, "de", late)).toBe("Gestern");
    expect(label("today", -2, "de", late)).toMatch(/25\.10\.$/);
  });
});
