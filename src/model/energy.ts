import type { Reader } from "./compute";
import { ENERGY_PERIODS, type EnergyPeriod } from "./config";

export { ENERGY_PERIODS, type EnergyPeriod };

/** Offset of a time zone to UTC at a moment, in ms (positive east of Greenwich). */
function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(date);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Calendar day (year, month 1-12, day) of a moment in a time zone. */
export function localDate(date: Date, timeZone: string): [number, number, number] {
  const local = new Date(date.getTime() + tzOffsetMs(date, timeZone));
  return [local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate()];
}

/** Hour (0-23) and weekday (0 = Sunday) of a moment in a time zone. */
export function localTime(date: Date, timeZone: string): { hour: number; weekday: number } {
  const local = new Date(date.getTime() + tzOffsetMs(date, timeZone));
  return { hour: local.getUTCHours(), weekday: local.getUTCDay() };
}

/** The moment a calendar day starts in a time zone (handles days with a daylight saving change). */
export function localMidnight(year: number, month: number, day: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day);
  const off = tzOffsetMs(new Date(guess), timeZone);
  const result = guess - off;
  const off2 = tzOffsetMs(new Date(result), timeZone);
  return new Date(off2 === off ? result : guess - off2);
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** First day of the week of a language (0 = Sunday), from the browser's locale data; undefined when it has none. */
function weekStartOf(language: string | undefined): number | undefined {
  try {
    if (!language) return undefined;
    // "en" alone has no region: maximize() adds the likely one (en-US)
    const loc = new Intl.Locale(language).maximize() as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const first = (loc.getWeekInfo?.() ?? loc.weekInfo)?.firstDay;
    return typeof first === "number" ? first % 7 : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Index (0 = Sunday) of the first day of the week from the Home Assistant locale (`first_weekday`).
 * "language" (the Home Assistant default) follows the language of the user; Monday when that is unknown.
 */
export const firstWeekdayIndex = (value: string | undefined, language?: string): number => {
  const v = String(value ?? "").toLowerCase();
  const i = WEEKDAYS.indexOf(v);
  if (i >= 0) return i;
  return (v === "language" ? weekStartOf(language) : undefined) ?? 1;
};

/** Local midnight of a calendar day given as year, month (1-12) and day; month and day may overflow (day 0, month 13). */
function midnightOf(year: number, month: number, day: number, timeZone: string): Date {
  const d = new Date(Date.UTC(year, month - 1, day));
  return localMidnight(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), timeZone);
}

/** First local calendar day (year, month, day) of the period `offset` periods away from the one that contains `now`. */
function firstDay(period: EnergyPeriod, now: Date, timeZone: string, firstWeekday: number, offset: number): [number, number, number] {
  const local = new Date(now.getTime() + tzOffsetMs(now, timeZone));
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth() + 1;
  const d = local.getUTCDate();
  if (period === "month") return [y, m + offset, 1];
  if (period === "today") return [y, m, d + offset];
  const back = (local.getUTCDay() - firstWeekday + 7) % 7;
  return [y, m, d - back + 7 * offset];
}

/**
 * Start and end of a period in the time zone of Home Assistant. `offset` 0 is the running period, which
 * ends now; -1 is the one before (yesterday, last week, last month), which ends where the next one starts.
 */
export function periodRange(
  period: EnergyPeriod,
  now: Date,
  timeZone: string,
  firstWeekday = 1,
  offset = 0,
): { start: Date; end: Date } {
  const [y, m, d] = firstDay(period, now, timeZone, firstWeekday, offset);
  const start = midnightOf(y, m, d, timeZone);
  if (offset >= 0) return { start, end: now };
  const end = period === "month" ? midnightOf(y, m + 1, 1, timeZone) : midnightOf(y, m, d + (period === "week" ? 7 : 1), timeZone);
  return { start, end };
}

/** Start of the day / week / month that contains `now`, in the time zone of Home Assistant. */
export function periodStart(period: EnergyPeriod, now: Date, timeZone: string, firstWeekday = 1): Date {
  return periodRange(period, now, timeZone, firstWeekday).start;
}

interface WsHass {
  callWS<T>(msg: Record<string, unknown>): Promise<T>;
}

type StatRow = { start?: number | string; change?: number | null };

/** Length of one statistics row: hours within a day, days for a week or a month. */
export type StatPeriod = "hour" | "day";
export const statPeriodFor = (period: EnergyPeriod): StatPeriod => (period === "today" ? "hour" : "day");

/** One statistics row of an energy sensor: when it starts (ms) and the energy of that hour / day in watt hours. */
export interface EnergyRow {
  start: number;
  wh: number;
}

/** Sum of the hourly / daily "change" values of each sensor, in kWh. */
export function sumChanges(result: Record<string, StatRow[] | undefined>): Map<string, number> {
  const sums = new Map<string, number>();
  for (const [id, rows] of Object.entries(result ?? {})) {
    if (!Array.isArray(rows)) continue;
    sums.set(id, rows.reduce((s, r) => s + (typeof r.change === "number" && Number.isFinite(r.change) ? r.change : 0), 0));
  }
  return sums;
}

/** Start of a row in ms: Home Assistant sends milliseconds, older versions an ISO date. */
const rowStart = (start: number | string | undefined): number =>
  typeof start === "number" ? start : typeof start === "string" ? Date.parse(start) : NaN;

/**
 * The hourly or daily rows of every sensor between `start` and `end`, in watt hours. Sensors without
 * statistics (no state class, or not recorded) are missing from the result.
 */
export async function loadEnergySeries(
  hass: WsHass,
  ids: string[],
  start: Date,
  end: Date,
  period: StatPeriod,
): Promise<Map<string, EnergyRow[]>> {
  if (!ids.length) return new Map();
  const result = await hass.callWS<Record<string, StatRow[] | undefined>>({
    type: "recorder/statistics_during_period",
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    statistic_ids: ids,
    // buckets align with the day in the time zone of Home Assistant; hours are only needed within one day
    period,
    types: ["change"],
    // converts every energy statistic to kWh, whatever unit the sensor reports
    units: { energy: "kWh" },
  });
  const series = new Map<string, EnergyRow[]>();
  for (const [id, rows] of Object.entries(result ?? {})) {
    if (!Array.isArray(rows)) continue;
    series.set(
      id,
      rows.map((r) => ({ start: rowStart(r.start), wh: typeof r.change === "number" && Number.isFinite(r.change) ? r.change * 1000 : 0 })),
    );
  }
  return series;
}

/** Sum of the rows of every sensor, in watt hours. */
export const sumSeries = (series: Map<string, EnergyRow[]>): Map<string, number> =>
  new Map([...series].map(([id, rows]) => [id, rows.reduce((s, r) => s + r.wh, 0)]));

/**
 * Energy used since the start of the period for every sensor, in watt hours. Sensors without
 * statistics (no state class, or not recorded) are missing from the result.
 */
export async function loadEnergy(
  hass: WsHass,
  ids: string[],
  period: EnergyPeriod,
  now: Date,
  timeZone: string,
  firstWeekday = 1,
): Promise<Map<string, number>> {
  const { start, end } = periodRange(period, now, timeZone, firstWeekday);
  return sumSeries(await loadEnergySeries(hass, ids, start, end, statPeriodFor(period)));
}

const MISSING = { watts: 0, valid: false };

/** Reader over loaded energy values (watt hours in "watts"); sensors without a value are invalid. */
export const energyReader =
  (values: Map<string, number>): Reader =>
  (id) => {
    const v = values.get(id);
    return v === undefined ? MISSING : { watts: v, valid: true };
  };

/** Periods the switch offers: the configured ones in their fixed order, all of them by default. */
export function offeredPeriods(configured: readonly EnergyPeriod[] | undefined): EnergyPeriod[] {
  const wanted = (configured ?? []).filter((p) => ENERGY_PERIODS.includes(p));
  return wanted.length ? ENERGY_PERIODS.filter((p) => wanted.includes(p)) : [...ENERGY_PERIODS];
}
