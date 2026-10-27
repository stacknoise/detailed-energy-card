import { nodeKey } from "./compute";
import type { EnergyCardConfig } from "./config";
import type { EnergyRow } from "./energy";
import { bucketIndex, bucketize, treeSeries } from "./timeline";

/** A price: fixed per kWh, or the hourly means of a price sensor (statistics). */
export interface PriceInput {
  fixed?: number;
  rows?: EnergyRow[];
}

/** Hours in a row without a price after which an amount is only approximate. */
export const MAX_PRICE_GAP_H = 3;

/**
 * The price of every hour. A fixed price is the same for all. A price sensor gives the hourly means; an hour
 * without a value takes the last known price (before the first one: the first one). `approx` when more than
 * {@link MAX_PRICE_GAP_H} hours in a row before `until` had no value. Undefined without any price.
 */
export function hourlyPrices(p: PriceInput, starts: number[], end: number, until: number): { prices: number[]; approx: boolean } | undefined {
  if (p.fixed !== undefined) return { prices: starts.map(() => p.fixed!), approx: false };
  if (!p.rows?.length) return undefined;
  const known: Array<number | undefined> = starts.map(() => undefined);
  for (const r of p.rows) {
    const i = bucketIndex(starts, r.start, end);
    if (i >= 0) known[i] = r.wh;
  }
  const first = known.find((v) => v !== undefined);
  if (first === undefined) {
    // no value in the period itself: the last value before it still applies
    const before = p.rows.filter((r) => r.start < (starts[0] ?? 0)).sort((a, b) => a.start - b.start).pop();
    if (!before) return undefined;
    return { prices: starts.map(() => before.wh), approx: starts.some((t, i) => t < until && i >= MAX_PRICE_GAP_H) };
  }
  let gap = 0;
  let approx = false;
  let last = first;
  const prices = known.map((v, i) => {
    if (v === undefined) {
      if (starts[i] < until && ++gap > MAX_PRICE_GAP_H) approx = true;
      return last;
    }
    gap = 0;
    last = v;
    return v;
  });
  return { prices, approx };
}

/** What the card shows of the costs of a period, in the currency of the prices. */
export interface CostResult {
  /** cost of every node by nodeKey: home, floors, rooms, consumers (their share from the grid) and the grid sources */
  nodes: Map<string, number>;
  /** watt hours of every node that came from the grid, by nodeKey (for the tooltip) */
  fromGrid: Map<string, number>;
  /** watt hours of every node in the period, by nodeKey (for the tooltip) */
  energy: Map<string, number>;
  /** the whole grid import */
  grid: number;
  /** part of `grid` beyond the consumption of the home: the battery charged from the grid */
  battery: number;
  /** compensation for the feed-in, when a feed-in price and a feed-in counter exist */
  feedIn?: number;
  /** a price sensor had no value for more than 3 hours in a row */
  approx: boolean;
}

/**
 * Costs of a period from hourly rows. Only energy from the grid costs money (solar and battery cost 0): every
 * hour has a grid share, the grid import over the consumption of the home (at most 1), and every node pays
 * its energy of that hour times the share times the price of that hour. Undefined without a grid energy
 * counter or without a price.
 */
export function computeCosts(i: {
  cfg: EnergyCardConfig;
  rows: Map<string, EnergyRow[]>;
  starts: number[];
  end: number;
  /** now: hours after it are not counted as missing prices */
  until: number;
  price: PriceInput;
  feedInPrice?: PriceInput;
}): CostResult | undefined {
  const grids = (i.cfg.sources ?? []).filter((s) => s.type === "grid" && s.energy_entity);
  if (!grids.length) return undefined;
  const p = hourlyPrices(i.price, i.starts, i.end, i.until);
  if (!p) return undefined;
  const hours = (id: string | undefined) => {
    const r = id ? i.rows.get(id) : undefined;
    return r ? bucketize(r, i.starts, i.end) : i.starts.map(() => 0);
  };
  const perGrid = grids.map((g) => ({ entity: g.entity, wh: hours(g.energy_entity) }));
  const grid = i.starts.map((_, h) => perGrid.reduce((s, g) => s + g.wh[h], 0));
  const series = treeSeries(i.cfg, i.rows, i.starts, i.end);
  const home = series.home ?? i.starts.map(() => 0);
  const share = home.map((v, h) => (v > 0 ? Math.min(1, grid[h] / v) : 0));
  const money = (wh: number[], h: number) => (wh[h] / 1000) * p.prices[h];

  const nodes = new Map<string, number>();
  const fromGrid = new Map<string, number>();
  const energy = new Map<string, number>();
  const put = (key: string, values: number[] | undefined) => {
    if (!values) return;
    let cost = 0;
    let wh = 0;
    values.forEach((v, h) => {
      cost += (v / 1000) * share[h] * p.prices[h];
      wh += v * share[h];
    });
    nodes.set(key, cost);
    fromGrid.set(key, wh);
    energy.set(key, values.reduce((s, v) => s + v, 0));
  };
  put(nodeKey.home, series.home);
  for (const [id, v] of series.floors) put(nodeKey.floor(id), v);
  for (const [id, v] of series.rooms) put(nodeKey.room(id), v);
  for (const [entity, v] of series.consumers) put(nodeKey.consumer(entity), v);
  for (const g of perGrid) nodes.set(nodeKey.source(g.entity), g.wh.reduce((s, _, h) => s + money(g.wh, h), 0));

  const total = grid.reduce((s, _, h) => s + money(grid, h), 0);
  const battery = grid.reduce((s, v, h) => s + (Math.max(0, v - home[h]) / 1000) * p.prices[h], 0);

  let feedIn: number | undefined;
  let approx = p.approx;
  const returns = grids.filter((g) => g.energy_entity_return);
  const fp = i.feedInPrice ? hourlyPrices(i.feedInPrice, i.starts, i.end, i.until) : undefined;
  if (fp && returns.length) {
    const back = returns.map((g) => hours(g.energy_entity_return));
    feedIn = i.starts.reduce((s, _, h) => s + (back.reduce((t, b) => t + b[h], 0) / 1000) * fp.prices[h], 0);
    approx ||= fp.approx;
  }
  return { nodes, fromGrid, energy, grid: total, battery, feedIn, approx };
}
