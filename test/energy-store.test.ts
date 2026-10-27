import { describe, expect, it } from "vitest";
import { ENERGY_REFRESH_MS, EnergyStore, queryKey, type EnergyQuery, type StoreClock } from "../src/model/energy-store";
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
  const calls: Array<{ q: EnergyQuery; resolve: (v: Map<string, EnergyRow[]>) => void; reject: (e: Error) => void }> = [];
  const load = (q: EnergyQuery) =>
    new Promise<Map<string, EnergyRow[]>>((resolve, reject) => {
      calls.push({ q, resolve, reject });
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
  it("keys a query by period, offset and sensors, in any order", () => {
    expect(queryKey({ ids: ["b", "a"], period: "today" })).toBe(queryKey({ ids: ["a", "b"], period: "today", offset: 0 }));
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
});
