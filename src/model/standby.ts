import type { EnergyCardConfig } from "./config";
import { localTime, type EnergyRow } from "./energy";

/** Hours of the night the base load is read from: 1 to 5 o'clock (the hours that begin at 1, 2, 3 and 4). */
export const NIGHT_FROM = 1;
export const NIGHT_TO = 5;
/** Nights the base load looks back on. */
export const BASE_LOAD_NIGHTS = 7;
/** Hours the standby check looks back on, and how many of them need a value before the card judges. */
export const STANDBY_HOURS = 24;
export const STANDBY_MIN_HOURS = 20;

/** Power sensors whose hourly means give the home's power: its own sensor, else all sources. */
export function homePowerIds(cfg: EnergyCardConfig): string[] {
  if (cfg.home?.total_entity) return [cfg.home.total_entity];
  return (cfg.sources ?? []).map((s) => s.entity);
}

/**
 * Hourly power of the home in watts from the hourly means of its sensors: the home's own sensor, else the sum of
 * the sources (grid and battery signed, `invert` turns a sensor around, a source never counts below 0 when it is
 * solar or generic). Without a sensor of the home, every source needs rows; an hour missing for one source
 * is left out rather than counted short.
 */
export function homePowerRows(cfg: EnergyCardConfig, series: Map<string, EnergyRow[]>): EnergyRow[] {
  const own = cfg.home?.total_entity;
  if (own) return (series.get(own) ?? []).map((r) => ({ start: r.start, wh: Math.max(0, r.wh) }));
  const sources = cfg.sources ?? [];
  if (!sources.length) return [];
  const perSource = sources.map((s) => {
    const sign = s.invert ? -1 : 1;
    const solar = s.type === "solar" || s.type === "generic";
    return new Map((series.get(s.entity) ?? []).map((r) => [r.start, solar ? Math.max(0, sign * r.wh) : sign * r.wh] as const));
  });
  const hours = [...perSource[0].keys()].filter((t) => perSource.every((m) => m.has(t))).sort((a, b) => a - b);
  return hours.map((t) => ({ start: t, wh: Math.max(0, perSource.reduce((sum, m) => sum + (m.get(t) ?? 0), 0)) }));
}

/**
 * The base load in watts: the lowest hourly mean between 1 and 5 o'clock (local time) of the rows given
 * (the card loads the last 7 nights). Undefined without a row in that time.
 */
export function baseLoad(rows: EnergyRow[], timeZone: string): number | undefined {
  let lowest: number | undefined;
  for (const r of rows) {
    const hour = localTime(new Date(r.start), timeZone).hour;
    if (hour < NIGHT_FROM || hour >= NIGHT_TO) continue;
    if (lowest === undefined || r.wh < lowest) lowest = r.wh;
  }
  return lowest;
}

/**
 * A consumer runs all the time when its hourly mean did not fall below `watts` in the rows given (the last 24 hours).
 * Fewer than {@link STANDBY_MIN_HOURS} hours with a value are too little to judge (a new sensor, a gap in the
 * statistics): no verdict, so no symbol and no warning.
 */
export function runsContinuously(rows: EnergyRow[] | undefined, watts: number): boolean {
  if (!rows || rows.length < STANDBY_MIN_HOURS) return false;
  return rows.every((r) => r.wh >= watts);
}
