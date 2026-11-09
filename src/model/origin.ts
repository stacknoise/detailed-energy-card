import { nodeKey } from "./compute";
import type { EnergyCardConfig, SourceConfig } from "./config";
import type { EnergyRow } from "./energy";
import { bucketize, treeSeries } from "./timeline";

/** Where the energy of a node comes from. */
export type OriginKind = "solar" | "battery" | "grid";
export const ORIGIN_KINDS: readonly OriginKind[] = ["solar", "battery", "grid"];

/** Watt hours of a node by origin and the shares of them (0..1, together 1). */
export interface Origin {
  wh: Record<OriginKind, number>;
  share: Record<OriginKind, number>;
}

/** The hours in which the home drew the least from the grid. */
export interface BestWindow {
  /** hour of the day (0..23) the window starts at; it lasts `BEST_HOURS` */
  fromHour: number;
  /** share of the grid in the window, 0..1 */
  gridShare: number;
}

export interface OriginResult {
  /** by nodeKey: home, floors, rooms and consumers */
  nodes: Map<string, Origin>;
  /** the origin of everything the home used */
  best?: BestWindow;
}

/** Length of the best window in hours. */
export const BEST_HOURS = 3;
/** A window needs this much energy (Wh) in the home to count. */
export const BEST_MIN_WH = 50;

/**
 * Which origins the sources can tell: a kind is known when a source of that type has an energy counter
 * (solar: produced, battery: discharged, grid: drawn). Needs at least two kinds, else there is nothing to split.
 */
export function originKinds(cfg: EnergyCardConfig): OriginKind[] {
  const has = (type: string) => (cfg.sources ?? []).some((s) => s.type === type && !!s.energy_entity);
  const kinds = ORIGIN_KINDS.filter((k) => has(k));
  return kinds.length >= 2 ? kinds : [];
}

/**
 * The origin of the energy of every node from hourly rows. Every hour the home takes its energy from the
 * sources in the share they delivered in that hour (solar produced, battery discharged, grid drawn); a node
 * gets that share of its energy of the hour. Hours without any delivery are left out. Undefined when
 * `originKinds` is empty or nothing was delivered.
 */
export function computeOrigin(i: { cfg: EnergyCardConfig; rows: Map<string, EnergyRow[]>; starts: number[]; end: number; timeZone: string }): OriginResult | undefined {
  const kinds = originKinds(i.cfg);
  if (!kinds.length) return undefined;
  const hours = (id: string | undefined) => {
    const r = id ? i.rows.get(id) : undefined;
    return r ? bucketize(r, i.starts, i.end) : i.starts.map(() => 0);
  };
  const delivered = {} as Record<OriginKind, number[]>;
  for (const k of ORIGIN_KINDS) {
    const sources = (i.cfg.sources ?? []).filter((s: SourceConfig) => s.type === k && s.energy_entity);
    const perSource = sources.map((s) => hours(s.energy_entity));
    delivered[k] = i.starts.map((_, h) => perSource.reduce((sum, v) => sum + Math.max(0, v[h]), 0));
  }
  const total = i.starts.map((_, h) => ORIGIN_KINDS.reduce((sum, k) => sum + delivered[k][h], 0));
  if (!total.some((v) => v > 0)) return undefined;
  const share = (k: OriginKind, h: number) => (total[h] > 0 ? delivered[k][h] / total[h] : 0);

  const series = treeSeries(i.cfg, i.rows, i.starts, i.end);
  const nodes = new Map<string, Origin>();
  const put = (key: string, values: number[] | undefined) => {
    if (!values) return;
    const wh: Record<OriginKind, number> = { solar: 0, battery: 0, grid: 0 };
    values.forEach((v, h) => {
      if (total[h] <= 0 || v <= 0) return;
      for (const k of ORIGIN_KINDS) wh[k] += v * share(k, h);
    });
    const sum = ORIGIN_KINDS.reduce((s, k) => s + wh[k], 0);
    if (sum <= 0) return;
    nodes.set(key, { wh, share: { solar: wh.solar / sum, battery: wh.battery / sum, grid: wh.grid / sum } });
  };
  put(nodeKey.home, series.home);
  for (const [id, v] of series.floors) put(nodeKey.floor(id), v);
  for (const [id, v] of series.rooms) put(nodeKey.room(id), v);
  for (const [entity, v] of series.consumers) put(nodeKey.consumer(entity), v);

  return { nodes, best: series.home && kinds.includes("grid") ? bestWindow(series.home, delivered.grid, total, i.starts, i.timeZone) : undefined };
}

/** Hour of the day (0..23) of a moment in a time zone. */
function hourOfDay(t: number, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone }).format(t)) % 24;
}

/**
 * The `BEST_HOURS` hours in a row, by hour of the day, in which the grid had the smallest share of what the
 * home used. Over several days the hours of the same time of day are added up. Undefined when no window has
 * `BEST_MIN_WH` of consumption.
 */
export function bestWindow(home: number[], grid: number[], total: number[], starts: number[], timeZone: string): BestWindow | undefined {
  const byHour = Array.from({ length: 24 }, () => ({ grid: 0, total: 0, home: 0 }));
  starts.forEach((t, h) => {
    if (total[h] <= 0) return;
    const b = byHour[hourOfDay(t, timeZone)];
    b.grid += grid[h];
    b.total += total[h];
    b.home += home[h];
  });
  let best: BestWindow | undefined;
  for (let from = 0; from + BEST_HOURS <= 24; from++) {
    const w = byHour.slice(from, from + BEST_HOURS);
    if (w.some((b) => b.total <= 0)) continue;
    const homeWh = w.reduce((s, b) => s + b.home, 0);
    if (homeWh < BEST_MIN_WH) continue;
    const gridShare = Math.min(1, w.reduce((s, b) => s + b.grid, 0) / w.reduce((s, b) => s + b.total, 0));
    if (!best || gridShare < best.gridShare) best = { fromHour: from, gridShare };
  }
  return best;
}
