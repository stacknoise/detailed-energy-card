import type { EnergyCardConfig, RoomConfig } from "./config";
import { localDate, localMidnight, periodRange, type EnergyPeriod, type EnergyRow } from "./energy";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Bars of the timeline: hours within a day, days for a week or a month. */
export type BucketUnit = "hour" | "day";
export const bucketUnitFor = (period: EnergyPeriod): BucketUnit => (period === "today" ? "hour" : "day");

/**
 * Start and end of a whole period (the running one included, unlike `periodRange`, which ends it now):
 * the end is the start of the next period.
 */
export function periodBounds(period: EnergyPeriod, now: Date, timeZone: string, firstWeekday = 1, offset = 0): { start: Date; end: Date } {
  return {
    start: periodRange(period, now, timeZone, firstWeekday, offset).start,
    end: periodRange(period, now, timeZone, firstWeekday, offset + 1).start,
  };
}

/** Starts (ms) of the bars between `start` and `end`: every hour, or every local midnight (days with a clock change included). */
export function bucketStarts(start: Date, end: Date, unit: BucketUnit, timeZone: string): number[] {
  const out: number[] = [];
  if (unit === "hour") {
    for (let t = start.getTime(); t < end.getTime(); t += HOUR) out.push(t);
    return out;
  }
  const [y, m, d] = localDate(start, timeZone);
  for (let i = 0; ; i++) {
    const t = localMidnight(y, m, d + i, timeZone).getTime();
    if (t >= end.getTime()) return out;
    out.push(t);
  }
}

/** Index of the bar a moment falls into, -1 outside. */
export function bucketIndex(starts: number[], t: number, end: number): number {
  if (!starts.length || t < starts[0] || t >= end) return -1;
  let i = starts.length - 1;
  while (i > 0 && starts[i] > t) i--;
  return i;
}

/** Watt hours of every bar; rows outside the bars are left out. */
export function bucketize(rows: EnergyRow[], starts: number[], end: number): number[] {
  const out = starts.map(() => 0);
  for (const r of rows) {
    const i = bucketIndex(starts, r.start, end);
    if (i >= 0) out[i] += r.wh;
  }
  return out;
}

/** Values per bar of every element; undefined for an element without any energy sensor below it. */
export interface TimelineSeries {
  home?: number[];
  floors: Map<string, number[] | undefined>;
  rooms: Map<string, number[] | undefined>;
  consumers: Map<string, number[] | undefined>;
}

const add = (a: number[] | undefined, b: number[] | undefined): number[] | undefined =>
  !a ? b && [...b] : !b ? a : a.map((v, i) => v + b[i]);

/**
 * Values per bar for the tree of the card, from the rows of the energy sensors. Like the card itself: an
 * element with its own counter uses it (when it has statistics), otherwise the sum of its children.
 */
export function treeSeries(cfg: EnergyCardConfig, rows: Map<string, EnergyRow[]>, starts: number[], end: number): TimelineSeries {
  const of = (id: string | undefined) => {
    const r = id ? rows.get(id) : undefined;
    return r ? bucketize(r, starts, end) : undefined;
  };
  const out: TimelineSeries = { floors: new Map(), rooms: new Map(), consumers: new Map() };
  const room = (r: RoomConfig): number[] | undefined => {
    let sum: number[] | undefined;
    for (const c of r.consumers ?? []) {
      const v = of(c.energy_entity);
      out.consumers.set(c.entity, v);
      sum = add(sum, v);
    }
    const v = of(r.energy_entity) ?? sum;
    out.rooms.set(r.area_id, v);
    return v;
  };
  let total: number[] | undefined;
  for (const f of cfg.floors ?? []) {
    let sum: number[] | undefined;
    for (const r of f.rooms ?? []) sum = add(sum, room(r));
    const v = of(f.energy_entity) ?? sum;
    out.floors.set(f.floor_id, v);
    total = add(total, v);
  }
  for (const r of cfg.rooms ?? []) total = add(total, room(r));
  out.home = of(cfg.home?.total_energy_entity) ?? total;
  return out;
}

/** Sum of the bars that start before `cutoff`. */
export const sumBefore = (values: number[], starts: number[], cutoff: number): number =>
  values.reduce((s, v, i) => (starts[i] < cutoff ? s + v : s), 0);

/**
 * How many days back the day lies that today is compared with: the same weekday of last week, or the same
 * day of last month (its last day when that month is shorter). 1 for the period "today" (yesterday).
 */
export function comparisonDayBack(period: EnergyPeriod, now: Date, timeZone: string): number {
  if (period === "today") return 1;
  if (period === "week") return 7;
  const [y, m, d] = localDate(now, timeZone);
  const lastOfPrev = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const today = localMidnight(y, m, d, timeZone).getTime();
  const then = localMidnight(y, m - 1, Math.min(d, lastOfPrev), timeZone).getTime();
  return Math.round((today - then) / DAY);
}

/**
 * The comparison of the timeline head: what the shown element used so far against the previous period
 * up to the same time. Today against yesterday up to the same full hour; a week or a month against the
 * same days of the previous one, with the running day compared up to the same full hour of its day.
 * Null when the previous period used nothing (no share can be given).
 */
export function compareWithPrevious(i: {
  unit: BucketUnit;
  now: number;
  /** bars of the running period and its values */
  starts: number[];
  values: number[];
  /** bars of the previous period and its values */
  prevStarts: number[];
  prevValues: number[];
  /** week / month: the hours of the day compared with today, and their values */
  dayStarts?: number[];
  dayValues?: number[];
  /** the period is over: compare it with the whole previous period */
  whole?: boolean;
}): { current: number; previous: number; change: number | null } {
  const current = i.values.reduce((s, v) => s + v, 0);
  let previous: number;
  if (i.whole) {
    previous = i.prevValues.reduce((s, v) => s + v, 0);
  } else if (i.unit === "hour") {
    // the statistics hold full hours only: compare as many full hours
    const hours = Math.floor((i.now - i.starts[0]) / HOUR);
    previous = sumBefore(i.prevValues, i.prevStarts, (i.prevStarts[0] ?? 0) + hours * HOUR);
  } else {
    const today = bucketIndex(i.starts, i.now, Infinity);
    const fullDays = i.prevValues.slice(0, Math.max(0, today)).reduce((s, v) => s + v, 0);
    const hours = Math.floor((i.now - i.starts[today]) / HOUR);
    const dayStart = i.dayStarts?.[0] ?? 0;
    previous = fullDays + (i.dayValues && i.dayStarts ? sumBefore(i.dayValues, i.dayStarts, dayStart + hours * HOUR) : 0);
  }
  return { current, previous, change: previous > 0 ? current / previous - 1 : null };
}

/** The bar with the largest value, -1 when all are 0. */
export function peakIndex(values: number[]): number {
  let best = -1;
  values.forEach((v, i) => {
    if (v > 0 && (best < 0 || v > values[best])) best = i;
  });
  return best;
}
