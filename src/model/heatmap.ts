import { ConfigError } from "./config";
import { hourlyPrices, type PriceInput } from "./costs";
import { localTime, type EnergyRow } from "./energy";

/** Configuration of the heatmap card (`custom:detailed-energy-heatmap-card`). */
export interface HeatmapConfig {
  type: string;
  /** energy counter (kWh) of the home */
  entity: string;
  /** number of days shown, 7 to 28 (default 7) */
  days?: number;
  title?: string;
  /** price per kWh: fixed, or a sensor whose hourly means are used (the most expensive hour needs one of them) */
  price?: number;
  price_entity?: string;
  currency?: string;
}

export const HEATMAP_MIN_DAYS = 7;
export const HEATMAP_MAX_DAYS = 28;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Checks the configuration of the heatmap card; the message names the field. */
export function validateHeatmapConfig(raw: unknown): HeatmapConfig {
  if (!isObj(raw)) throw new ConfigError("Invalid configuration");
  const entity = raw.entity;
  if (typeof entity !== "string" || !/^sensor\.[\w]+$/.test(entity)) throw new ConfigError("entity: an energy sensor (sensor.…) is required");
  const days = raw.days;
  if (days !== undefined && (typeof days !== "number" || !Number.isInteger(days) || days < HEATMAP_MIN_DAYS || days > HEATMAP_MAX_DAYS)) {
    throw new ConfigError(`days must be a whole number from ${HEATMAP_MIN_DAYS} to ${HEATMAP_MAX_DAYS}`);
  }
  if (raw.title !== undefined && typeof raw.title !== "string") throw new ConfigError("title must be text");
  const price = raw.price;
  if (price !== undefined && (typeof price !== "number" || !Number.isFinite(price) || price < 0)) {
    throw new ConfigError("price must be a number of 0 or more (price per kWh)");
  }
  if (raw.price_entity !== undefined && (typeof raw.price_entity !== "string" || !/^sensor\.[\w]+$/.test(raw.price_entity))) {
    throw new ConfigError("price_entity must be a sensor (sensor.…)");
  }
  if (price !== undefined && raw.price_entity !== undefined) throw new ConfigError("price and price_entity: use one of them, not both");
  const cur = raw.currency;
  if (cur !== undefined && (typeof cur !== "string" || !/^[A-Z]{3}$/.test(cur))) throw new ConfigError("currency must be a three-letter currency code like EUR");
  return raw as unknown as HeatmapConfig;
}

/** A cell: the watt hours of the hour, or why there is no number. */
export type HeatCell = number | "missing" | "future";

export interface HeatDay {
  /** start of the day (ms) */
  start: number;
  cells: HeatCell[];
}

export interface HeatGrid {
  days: HeatDay[];
  /** the largest cell, 0 when there is none */
  max: number;
}

/**
 * The grid of the heatmap: a row per day (the oldest first), a column per local hour. A day with a repeated hour
 * (clocks back) adds both hours up, a day with a missing hour (clocks forward) leaves that column "missing" like
 * every hour without a statistics row; hours that have not begun yet are "future".
 */
export function heatmapGrid(rows: EnergyRow[], dayStarts: number[], timeZone: string, now: number): HeatGrid {
  const days: HeatDay[] = dayStarts.map((start) => ({ start, cells: Array.from({ length: 24 }, () => "missing" as HeatCell) }));
  const hasValue = days.map(() => Array.from({ length: 24 }, () => false));
  for (const r of rows) {
    let d = -1;
    for (let i = 0; i < dayStarts.length; i++) if (dayStarts[i] <= r.start) d = i;
    if (d < 0) continue;
    const hour = localTime(new Date(r.start), timeZone).hour;
    const cur = days[d].cells[hour];
    days[d].cells[hour] = hasValue[d][hour] ? (cur as number) + r.wh : r.wh;
    hasValue[d][hour] = true;
  }
  // the running hour and the ones after it have no complete row yet, and are not gaps
  const today = days[days.length - 1];
  if (today && now >= today.start && now < today.start + 25 * 3_600_000) {
    const nowHour = localTime(new Date(now), timeZone).hour;
    for (let h = nowHour; h < 24; h++) if (!hasValue[days.length - 1][h]) today.cells[h] = "future";
  }
  let max = 0;
  for (const d of days) for (const c of d.cells) if (typeof c === "number" && c > max) max = c;
  return { days, max };
}

/** Share of the largest cell, 0 to 1, that sets the color of a cell. */
export const heatLevel = (wh: number, max: number): number => (max > 0 ? Math.min(1, Math.max(0, wh / max)) : 0);

/** The hour with the largest consumption; undefined without a row above 0. */
export function peakHour(rows: EnergyRow[]): EnergyRow | undefined {
  let best: EnergyRow | undefined;
  for (const r of rows) if (r.wh > 0 && (!best || r.wh > best.wh)) best = r;
  return best;
}

/**
 * The hour with the highest cost: its consumption times the price of that hour. A price sensor gives hourly means
 * (an hour without one takes the last known price, see `hourlyPrices`); without any price: undefined.
 */
export function costliestHour(rows: EnergyRow[], price: PriceInput, until: number): { start: number; wh: number; cost: number } | undefined {
  const sorted = [...rows].sort((a, b) => a.start - b.start);
  const starts = sorted.map((r) => r.start);
  const p = hourlyPrices(price, starts, (starts[starts.length - 1] ?? 0) + 3_600_000, until);
  if (!p) return undefined;
  let best: { start: number; wh: number; cost: number } | undefined;
  sorted.forEach((r, i) => {
    const cost = (r.wh / 1000) * p.prices[i];
    if (cost > 0 && (!best || cost > best.cost)) best = { start: r.start, wh: r.wh, cost };
  });
  return best;
}
