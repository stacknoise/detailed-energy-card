import { describe, expect, it } from "vitest";
import { validateConfig } from "../src/model/config";
import { COMPACT, HOME_H, SECONDARY_H, SOURCE_H, computeLayout } from "../src/view/layout";

const base = { width: 400, sources: 3, floors: 3, rooms: 0 };

describe("compact layout", () => {
  it("is lower than the normal layout in every row", () => {
    const n = computeLayout(base);
    const c = computeLayout({ ...base, compact: true });
    expect(c.sourceH).toBe(COMPACT.sourceH);
    expect(c.sourceH).toBeLessThan(SOURCE_H);
    expect(c.homeH).toBe(COMPACT.homeH);
    expect(c.homeH).toBeLessThan(HOME_H);
    expect(c.yHome).toBeLessThan(n.yHome);
    expect(c.yFloor - c.yHome).toBeLessThan(n.yFloor - n.yHome);
    expect(c.height).toBeLessThan(n.height);
    // the floors stay in their places across the width
    expect(c.floorXs).toEqual(n.floorXs);
  });

  it("is the same as before without the option", () => {
    const n = computeLayout(base);
    expect(n.homeH).toBe(HOME_H);
    expect(n.sourceH).toBe(SOURCE_H);
    expect(computeLayout({ ...base, compact: false })).toEqual(n);
  });

  it("draws rooms in one row when there are no floors, lower than normal", () => {
    const rooms = { width: 400, sources: 2, floors: 0, rooms: 4 };
    const n = computeLayout(rooms);
    const c = computeLayout({ ...rooms, compact: true });
    expect(c.yRoom - c.yHome).toBeLessThan(n.yRoom - n.yHome);
    expect(c.height).toBeLessThan(n.height);
    expect(c.roomYs).toEqual([c.yRoom, c.yRoom, c.yRoom, c.yRoom]);
  });

  it("still makes room for a second value and for the line of the other direction", () => {
    const plain = computeLayout({ ...base, compact: true });
    const second = computeLayout({ ...base, compact: true, secondary: true, returnLine: true });
    expect(second.sourceH).toBe(plain.sourceH + 2 * SECONDARY_H);
    expect(second.height).toBeGreaterThan(plain.height);
  });

  it("has no height without sources, floors and rooms to speak of", () => {
    const l = computeLayout({ width: 300, sources: 0, floors: 0, rooms: 0, compact: true });
    expect(l.yHome).toBe(0);
    expect(l.height).toBe(COMPACT.homeH);
  });
});

describe("options.compact", () => {
  it("is true or false", () => {
    expect(() => validateConfig({ type: "x", options: { compact: true } })).not.toThrow();
    expect(() => validateConfig({ type: "x", options: { compact: "yes" } })).toThrow(/options\.compact must be true or false/);
  });
});
