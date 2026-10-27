import { periodRange, type EnergyPeriod } from "./energy";

/** Texts of the labels that are not formatted by `Intl`. */
export interface BrowseText {
  yesterday: string;
  /** "KW 42" */
  week: (n: number) => string;
}

/** ISO number of the week that contains the given local calendar day (the week of its Thursday). */
export function isoWeek(year: number, month: number, day: number): number {
  const d = new Date(Date.UTC(year, month, day));
  const wd = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - wd + 3); // Thursday of that week
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - first.getTime()) / 86_400_000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
}

/** Local calendar day of an instant in a time zone. */
function localDay(date: Date, timeZone: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month") - 1, d: get("day") };
}

/**
 * What the head shows for a period that is not the running one: "Yesterday", "Mon 19.10.", "KW 42", "September"
 * (with the year when it is not the current one). Undefined for the running period.
 */
export function periodLabel(
  period: EnergyPeriod,
  offset: number,
  now: Date,
  timeZone: string,
  firstWeekday: number,
  lang: string | undefined,
  text: BrowseText,
): string | undefined {
  if (offset >= 0) return undefined;
  const start = periodRange(period, now, timeZone, firstWeekday, offset).start;
  if (period === "today") {
    if (offset === -1) return text.yesterday;
    const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(lang, { timeZone, ...o }).format(start);
    return `${fmt({ weekday: "short" })} ${fmt({ day: "numeric", month: "numeric" })}`;
  }
  if (period === "week") {
    // the week of its middle day: the number of the week most of its days belong to
    const mid = localDay(new Date(start.getTime() + 3.5 * 86_400_000), timeZone);
    return text.week(isoWeek(mid.y, mid.m, mid.d));
  }
  const sameYear = localDay(start, timeZone).y === localDay(now, timeZone).y;
  return new Intl.DateTimeFormat(lang, { timeZone, month: "long", ...(sameYear ? {} : { year: "numeric" }) }).format(start);
}
