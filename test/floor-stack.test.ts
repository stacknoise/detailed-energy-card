import { describe, expect, it } from "vitest";
import { FLOOR_H, COMPACT, computeLayout, floorsStacked } from "../src/view/layout";

describe("floorsStacked", () => {
  it("keeps the value next to the name while the floors fit", () => {
    expect(floorsStacked(512, ["EG", "OG", "Keller"])).toBe(false);
    expect(floorsStacked(320, ["EG"])).toBe(false);
  });
  it("puts the value under the name when four floors are too wide for the card", () => {
    expect(floorsStacked(512, ["EG", "OG", "Keller", "Dachgeschoss"])).toBe(true);
    expect(floorsStacked(320, ["EG", "OG", "Keller"])).toBe(true);
  });
  it("needs more room for longer names", () => {
    expect(floorsStacked(512, ["Erdgeschoss", "Obergeschoss", "Dachgeschoss"])).toBe(true);
  });
});

describe("computeLayout with stacked floors", () => {
  const base = { width: 512, sources: 3, floors: 4, rooms: 2 };
  it("makes the floor row and everything below it taller", () => {
    const n = computeLayout(base);
    const s = computeLayout({ ...base, stackFloors: true });
    expect(n.floorH).toBe(FLOOR_H);
    expect(s.floorH).toBe(COMPACT.floorH);
    expect(s.yRoom - n.yRoom).toBe(COMPACT.floorH - FLOOR_H);
    expect(s.height - n.height).toBe(COMPACT.floorH - FLOOR_H);
  });
  it("changes nothing without floors that need it", () => {
    expect(computeLayout({ ...base, stackFloors: false })).toEqual(computeLayout(base));
  });
});
