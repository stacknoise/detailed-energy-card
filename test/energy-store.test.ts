import { describe, expect, it } from "vitest";
import { ENERGY_REFRESH_MS, WINDOW_REFRESH_MS, EnergyStore, latestRow, mergeRows, queryKey, type EnergyQuery, type StoreClock } from "../src/model/energy-store";
import type { EnergyRow } from "../src/model/energy";

/** A clock whose time and timers only move when the test says so. */
function fakeClock() {
  let t = 0;
  let next = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: StoreClock = {
    now: () => t,
    setTimeout: (fn, ms) => {
      const id = next++;
      timers.set(id, { at: t + ms, fn });
      return id;
    },
    clearTimeout: (id) => void timers.delete(id),
  };
  const advance = (ms: number) => {
    t += ms;
    for (const [id, timer] of [...timers]) {
      if (timer.at > t) continue;
      timers.delete(id);
      timer.fn();
    }
  };
  return { clock, advance, pending: () => timers.size };
}

/** A loader whose answers the test hands out one by one. */
function fakeLoader() {
  const calls: Array<{ q: EnergyQuery; since?: number; resolve: (v: Map<string, EnergyRow[]>, since?: number) => void; reject: (e: Error) => void }> = [];
  const load = (q: EnergyQuery, since?: number) =>
    new Promise<{ series: Map<string, EnergyRow[]>; since?: number }>((resolve, reject) => {
      calls.push({ q, since, resolve: (series, from) => resolve({ series, since: from }), reject });
    });
  return { load, calls };
}

const rows = (...wh: number[]): EnergyRow[] => wh.map((v, i) => ({ start: i * 3_600_000, wh: v }));
const settle = () => new Promise((r) => setTimeout(r, 0));
const TODAY: EnergyQuery = { ids: ["sensor.a", "sensor.b"], period: "today" };
const WEEK: EnergyQuery = { ids: ["sensor.a", "sensor.b"], period: "week" };

function setup(visible = true) {
  const time = fakeClock();
  const loader = fakeLoader();
  let changes = 0;
  const view = { visible };
  const store = new EnergyStore(loader.load, () => changes++, () => view.visible, time.clock);
  return { store, loader, time, view, changes: () => changes };
}

describe("energy store", () => {
  it("keys a query by period, offset, rows, kind and sensors, in any order", () => {
    expect(queryKey({ ids: ["b", "a"], period: "today" })).toBe(queryKey({ ids: ["a", "b"], period: "today", offset: 0, stat: "hour", kind: "energy" }));
    expect(queryKey(WEEK)).not.toBe(queryKey({ ...WEEK, stat: "hour" }));
    expect(queryKey(TODAY)).not.toBe(queryKey({ ...TODAY, kind: "mean" }));
    expect(queryKey(TODAY)).not.toBe(queryKey(WEEK));
    expect(queryKey(TODAY)).not.toBe(queryKey({ ...TODAY, offset: -1 }));
  });

  it("loads a wanted query once and sums its rows", async () => {
    const { store, loader } = setup();
    store.want([TODAY]);
    store.want([TODAY]); // a second hass update while loading
    expect(loader.calls).toHaveLength(1);
    expect(store.status(TODAY)).toBe("loading");
    loader.calls[0].resolve(new Map([["sensor.a", rows(100, 250)]]));
    await settle();
    expect(store.status(TODAY)).toBe("ok");
    expect(store.values(TODAY)).toEqual(new Map([["sensor.a", 350]]));
    expect(store.series(TODAY)?.get("sensor.a")).toHaveLength(2);
    store.want([TODAY]);
    expect(loader.calls).toHaveLength(1);
  });

  it("reports loading, answers and errors", async () => {
    const { store, loader, changes } = setup();
    store.want([TODAY]);
    expect(changes()).toBe(1); // loading
    loader.calls[0].reject(new Error("no statistics"));
    await settle();
    expect(store.status(TODAY)).toBe("error");
    expect(store.values(TODAY)).toBeUndefined();
    expect(changes()).toBe(2);
  });

  it("drops the numbers of a query that is no longer shown, and an answer still on its way for it", async () => {
    const { store, loader } = setup();
    store.want([TODAY]);
    store.want([WEEK]);
    expect(loader.calls.map((c) => c.q.period)).toEqual(["today", "week"]);
    loader.calls[0].resolve(new Map([["sensor.a", rows(1)]]));
    await settle();
    expect(store.status(TODAY)).toBe("idle");
    store.want([TODAY]);
    expect(loader.calls).toHaveLength(3); // loaded again, not the stale numbers
  });

  it("loads a rolling window of hours once an hour while the other queries keep their 5 minutes", async () => {
    const { store, loader, time } = setup();
    const window: EnergyQuery = { ids: ["sensor.p"], period: "today", hours: 168, stat: "hour", kind: "mean" };
    expect(queryKey(window)).not.toBe(queryKey({ ...window, hours: 24 }));
    store.want([TODAY, window]);
    loader.calls[0].resolve(new Map([["sensor.a", rows(1)]]));
    loader.calls[1].resolve(new Map([["sensor.p", rows(100)]]));
    await settle();
    time.advance(ENERGY_REFRESH_MS);
    // only the period is asked for again
    expect(loader.calls.map((c) => c.q.hours)).toEqual([undefined, 168, undefined]);
    loader.calls[2].resolve(new Map([["sensor.a", rows(2)]]));
    await settle();
    time.advance(WINDOW_REFRESH_MS - ENERGY_REFRESH_MS);
    expect(loader.calls.filter((c) => c.q.hours === 168)).toHaveLength(2);
  });

  it("loads again after the refresh interval while the card is visible", async () => {
    const { store, loader, time } = setup();
    store.want([TODAY]);
    loader.calls[0].resolve(new Map([["sensor.a", rows(1)]]));
    await settle();
    time.advance(ENERGY_REFRESH_MS - 1);
    expect(loader.calls).toHaveLength(1);
    time.advance(1);
    expect(loader.calls).toHaveLength(2);
    // the shown numbers stay while the new ones are on their way
    expect(store.status(TODAY)).toBe("ok");
    expect(store.values(TODAY)?.get("sensor.a")).toBe(1);
  });

  it("ends the chain while the card is hidden and catches up when it is seen again", async () => {
    const { store, loader, time, view } = setup();
    store.want([TODAY]);
    loader.calls[0].resolve(new Map([["sensor.a", rows(1)]]));
    await settle();
    view.visible = false;
    time.advance(ENERGY_REFRESH_MS);
    expect(loader.calls).toHaveLength(1);
    expect(time.pending()).toBe(0);
    view.visible = true;
    store.refresh();
    expect(loader.calls).toHaveLength(2);
  });

  it("does not load on refresh while the numbers are fresh, it waits out the rest", async () => {
    const { store, loader, time } = setup();
    store.want([TODAY]);
    loader.calls[0].resolve(new Map([["sensor.a", rows(1)]]));
    await settle();
    time.advance(60_000);
    store.refresh();
    expect(loader.calls).toHaveLength(1);
    time.advance(ENERGY_REFRESH_MS - 60_000);
    expect(loader.calls).toHaveLength(2);
  });

  it("drops an answer that arrives after the card was detached and loads again when it is back", async () => {
    const { store, loader } = setup();
    store.want([TODAY]);
    store.pause();
    expect(store.status(TODAY)).toBe("idle");
    loader.calls[0].resolve(new Map([["sensor.a", rows(1)]]));
    await settle();
    expect(store.values(TODAY)).toBeUndefined();
    store.refresh();
    expect(loader.calls).toHaveLength(2);
    loader.calls[1].resolve(new Map([["sensor.a", rows(2)]]));
    await settle();
    expect(store.values(TODAY)?.get("sensor.a")).toBe(2);
  });

  it("keeps the last numbers while detached and loads them again when they are old", async () => {
    const { store, loader, time } = setup();
    store.want([TODAY]);
    loader.calls[0].resolve(new Map([["sensor.a", rows(1)]]));
    await settle();
    store.pause();
    time.advance(ENERGY_REFRESH_MS * 2);
    expect(loader.calls).toHaveLength(1);
    expect(store.values(TODAY)?.get("sensor.a")).toBe(1);
    store.refresh();
    expect(loader.calls).toHaveLength(2);
  });

  it("forgets everything on clear and loads nothing without a wanted query", async () => {
    const { store, loader, time } = setup();
    store.want([TODAY]);
    loader.calls[0].resolve(new Map([["sensor.a", rows(1)]]));
    await settle();
    store.clear();
    expect(store.values(TODAY)).toBeUndefined();
    store.refresh();
    time.advance(ENERGY_REFRESH_MS * 2);
    expect(loader.calls).toHaveLength(1);
  });

  it("loads several queries side by side", async () => {
    const { store, loader } = setup();
    const yesterday = { ...TODAY, offset: -1 };
    store.want([TODAY, yesterday]);
    expect(loader.calls.map((c) => c.q.offset ?? 0)).toEqual([0, -1]);
    loader.calls[1].resolve(new Map([["sensor.a", rows(5)]]));
    await settle();
    expect(store.values(yesterday)?.get("sensor.a")).toBe(5);
    expect(store.status(TODAY)).toBe("loading");
  });

  it("loads an incremental query only from its latest row on and keeps the older rows", async () => {
    const { store, loader, time } = setup();
    const q: EnergyQuery = { ...WEEK, stat: "hour", incremental: true };
    store.want([q]);
    expect(loader.calls[0].since).toBeUndefined();
    loader.calls[0].resolve(new Map([["sensor.a", rows(10, 20, 30)]]));
    await settle();
    time.advance(ENERGY_REFRESH_MS);
    // the latest row starts at 2 h: it is loaded again, together with what came after it
    expect(loader.calls[1].since).toBe(2 * 3_600_000);
    loader.calls[1].resolve(new Map([["sensor.a", [{ start: 2 * 3_600_000, wh: 35 }, { start: 3 * 3_600_000, wh: 5 }]]]), 2 * 3_600_000);
    await settle();
    expect(store.series(q)?.get("sensor.a")?.map((r) => r.wh)).toEqual([10, 20, 35, 5]);
    expect(store.values(q)?.get("sensor.a")).toBe(70);
  });

  it("replaces the rows when the loader answers without since (a new period)", async () => {
    const { store, loader, time } = setup();
    const q: EnergyQuery = { ...TODAY, incremental: true };
    store.want([q]);
    loader.calls[0].resolve(new Map([["sensor.a", rows(10, 20)]]));
    await settle();
    time.advance(ENERGY_REFRESH_MS);
    loader.calls[1].resolve(new Map([["sensor.a", rows(1)]]));
    await settle();
    expect(store.values(q)?.get("sensor.a")).toBe(1);
  });

  it("merges rows and finds the latest one", () => {
    const old = new Map([["a", rows(1, 2, 3)], ["b", rows(4)]]);
    expect(latestRow(old)).toBe(2 * 3_600_000);
    expect(latestRow(new Map())).toBeUndefined();
    const merged = mergeRows(old, new Map([["a", [{ start: 2 * 3_600_000, wh: 9 }]], ["c", rows(7)]]), 2 * 3_600_000);
    expect(merged.get("a")?.map((r) => r.wh)).toEqual([1, 2, 9]);
    expect(merged.get("b")?.map((r) => r.wh)).toEqual([4]);
    expect(merged.get("c")?.map((r) => r.wh)).toEqual([7]);
  });
});
