import { statPeriodFor, sumSeries, type EnergyPeriod, type EnergyRow, type StatPeriod } from "./energy";

/** How often the energy of a period is asked for again. */
export const ENERGY_REFRESH_MS = 5 * 60_000;
/** How often a rolling window of hours (base load, standby) is asked for again: its rows only change by the hour. */
export const WINDOW_REFRESH_MS = 60 * 60_000;

export type EnergyStatus = "idle" | "loading" | "ok" | "error";

/** What to load: the sensors and the period, `offset` periods away from the running one (0). */
export interface EnergyQuery {
  ids: string[];
  period: EnergyPeriod;
  offset?: number;
  /** rows per hour or per day; default hours for "today", days for a week or a month */
  stat?: StatPeriod;
  /**
   * "energy" (default): the change of energy counters in watt hours; "mean": the hourly mean of a measurement
   * such as a price; "change": the change of another total such as a cost, in its own unit. Rows of "mean"
   * and "change" keep their value in `wh` as it is.
   */
  kind?: "energy" | "mean" | "change";
  /** a refresh only loads the rows from the latest one on and keeps the older ones (long hourly queries) */
  incremental?: boolean;
  /** instead of the period: the last N hours until now, hourly rows, refreshed once an hour (`period` is then only a placeholder) */
  hours?: number;
}

/** Seconds between two loads of a query. */
const intervalOf = (q: EnergyQuery): number => (q.hours ? WINDOW_REFRESH_MS : ENERGY_REFRESH_MS);

/**
 * Loads the rows of a query; the caller knows `hass`. With `since` (a refresh of an incremental query) it may
 * load from that moment on only and returns it as `since`; without `since` in the answer the rows replace
 * the old ones (for example when a new day has started).
 */
export type EnergyLoader = (query: EnergyQuery, since?: number) => Promise<{ series: Map<string, EnergyRow[]>; since?: number }>;

/** Start of the latest row of all sensors, undefined without rows. */
export function latestRow(series: Map<string, EnergyRow[]>): number | undefined {
  let latest: number | undefined;
  for (const rows of series.values()) for (const r of rows) if (latest === undefined || r.start > latest) latest = r.start;
  return latest;
}

/** Old rows before `since` and the new ones from `since` on. */
export function mergeRows(old: Map<string, EnergyRow[]>, fresh: Map<string, EnergyRow[]>, since: number): Map<string, EnergyRow[]> {
  const out = new Map<string, EnergyRow[]>();
  for (const id of new Set([...old.keys(), ...fresh.keys()])) {
    out.set(id, [...(old.get(id) ?? []).filter((r) => r.start < since), ...(fresh.get(id) ?? [])]);
  }
  return out;
}

interface Entry {
  status: EnergyStatus;
  series?: Map<string, EnergyRow[]>;
  /** sums of `series`, computed once per answer */
  sums?: Map<string, number>;
  /** when the last answer arrived (ms); 0 = none yet */
  at: number;
  /** answers carrying another token are dropped */
  token: number;
}

export interface StoreClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

const browserClock: StoreClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (id) => window.clearTimeout(id),
};

/** Key of a query: the same sensors, period, rows and kind share one entry, whatever order the ids come in. */
export const queryKey = (q: EnergyQuery): string =>
  `${q.period}|${q.offset ?? 0}|${q.hours ?? 0}|${q.stat ?? statPeriodFor(q.period)}|${q.kind ?? "energy"}|${[...q.ids].sort().join(",")}`;

/**
 * Energy values of the queries the card currently shows. Every query is loaded once, kept for
 * {@link ENERGY_REFRESH_MS} and then loaded again while the card is visible. While the card is detached
 * or hidden the refresh chain stops; `refresh()` catches up when it is back.
 */
export class EnergyStore {
  private _entries = new Map<string, Entry>();
  private _wanted: EnergyQuery[] = [];
  private _timer = 0;
  private _token = 0;

  constructor(
    private readonly _load: EnergyLoader,
    /** called after every change of a value or a status */
    private readonly _changed: () => void,
    /** false while the card is scrolled out of view: the timer then ends the chain instead of loading */
    private readonly _visible: () => boolean,
    private readonly _clock: StoreClock = browserClock,
  ) {}

  /** Values of a query in watt hours; undefined until its first answer. */
  values(q: EnergyQuery): Map<string, number> | undefined {
    return this._entries.get(queryKey(q))?.sums;
  }

  /** Rows of a query in watt hours; undefined until its first answer. */
  series(q: EnergyQuery): Map<string, EnergyRow[]> | undefined {
    return this._entries.get(queryKey(q))?.series;
  }

  status(q: EnergyQuery): EnergyStatus {
    return this._entries.get(queryKey(q))?.status ?? "idle";
  }

  /**
   * The queries the card shows now. Entries of other queries are dropped (their numbers would be stale
   * when they are wanted again), new ones are loaded.
   */
  want(queries: EnergyQuery[]): void {
    const keys = new Set(queries.map(queryKey));
    for (const [key, e] of this._entries) {
      if (keys.has(key)) continue;
      e.token = ++this._token;
      this._entries.delete(key);
    }
    this._wanted = queries;
    if (!queries.length) this._clock.clearTimeout(this._timer);
    for (const q of queries) if (this.status(q) === "idle") void this._fetch(q);
  }

  /** Loads every wanted query again now, also when it is still fresh. */
  reload(): void {
    for (const q of this._wanted) if (this.status(q) !== "loading") void this._fetch(q);
  }

  /** Loads the wanted queries whose interval is over (a rolling window of hours waits for its hour). */
  private _reloadDue(): void {
    for (const q of this._wanted) {
      const e = this._entries.get(queryKey(q));
      if (e?.status === "loading") continue;
      if (e?.status === "ok" && this._clock.now() - e.at < intervalOf(q)) continue;
      void this._fetch(q);
    }
  }

  /**
   * Brings the wanted queries up to date after the refresh chain was interrupted (card detached or hidden):
   * loads again what is old, otherwise waits out the rest of the interval.
   */
  refresh(): void {
    let wait = Infinity;
    for (const q of this._wanted) {
      const e = this._entries.get(queryKey(q));
      if (e?.status === "loading") continue;
      const age = this._clock.now() - (e?.at ?? 0);
      if (e?.status === "ok" && age < intervalOf(q)) wait = Math.min(wait, intervalOf(q) - age);
      else void this._fetch(q);
    }
    if (wait < Infinity) this._schedule(wait);
  }

  /** The card is detached: stop the timer and drop answers on their way; the last values stay. */
  pause(): void {
    this._clock.clearTimeout(this._timer);
    for (const e of this._entries.values()) {
      e.token = ++this._token;
      // the dropped answer would never end "loading"
      if (e.status === "loading") e.status = "idle";
    }
  }

  /** Forgets everything (new configuration). */
  clear(): void {
    this.pause();
    this._entries.clear();
    this._wanted = [];
  }

  private _schedule(ms: number): void {
    this._clock.clearTimeout(this._timer);
    this._timer = this._clock.setTimeout(() => {
      // while the card is hidden the chain just ends; refresh() starts it again when the card is seen
      if (this._visible()) this._reloadDue();
    }, ms);
  }

  private async _fetch(q: EnergyQuery): Promise<void> {
    const key = queryKey(q);
    const entry = this._entries.get(key) ?? { status: "idle", at: 0, token: 0 };
    const token = (entry.token = ++this._token);
    this._entries.set(key, entry);
    // an answer that is shown stays visible while the new one is loading
    if (entry.status !== "ok") {
      entry.status = "loading";
      this._changed();
    }
    try {
      // a long hourly query only loads what is new since its latest row (that row again, it may have grown)
      const since = q.incremental && entry.series ? latestRow(entry.series) : undefined;
      const answer = await this._load(q, since);
      if (this._entries.get(key) !== entry || entry.token !== token) return;
      const series = answer.since !== undefined && entry.series ? mergeRows(entry.series, answer.series, answer.since) : answer.series;
      entry.series = series;
      entry.sums = sumSeries(series);
      entry.at = this._clock.now();
      entry.status = "ok";
    } catch {
      if (this._entries.get(key) !== entry || entry.token !== token) return;
      entry.series = undefined;
      entry.sums = undefined;
      entry.status = "error";
    }
    this._changed();
    // the statistics are compiled every few minutes: ask again from time to time
    this._schedule(ENERGY_REFRESH_MS);
  }
}
