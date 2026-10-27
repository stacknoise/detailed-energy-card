import { sumSeries, type EnergyPeriod, type EnergyRow } from "./energy";

/** How often the energy of a period is asked for again. */
export const ENERGY_REFRESH_MS = 5 * 60_000;

export type EnergyStatus = "idle" | "loading" | "ok" | "error";

/** What to load: the energy sensors and the period, `offset` periods away from the running one (0). */
export interface EnergyQuery {
  ids: string[];
  period: EnergyPeriod;
  offset?: number;
}

/** Loads the rows of a query; the store calls it with the query and nothing else, the caller knows `hass`. */
export type EnergyLoader = (query: EnergyQuery) => Promise<Map<string, EnergyRow[]>>;

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

/** Key of a query: the same sensors and period share one entry, whatever order the ids come in. */
export const queryKey = (q: EnergyQuery): string => `${q.period}|${q.offset ?? 0}|${[...q.ids].sort().join(",")}`;

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
      if (e?.status === "ok" && age < ENERGY_REFRESH_MS) wait = Math.min(wait, ENERGY_REFRESH_MS - age);
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
      if (this._visible()) this.reload();
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
      const series = await this._load(q);
      if (this._entries.get(key) !== entry || entry.token !== token) return;
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
