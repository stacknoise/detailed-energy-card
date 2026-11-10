import { describe, expect, it } from "vitest";
import {
  arrowDelta,
  cellAt,
  dragTo,
  drawnLayout,
  insideGrid,
  isFree,
  movedLayout,
  moveBy,
  onHandle,
  overlaps,
  resizeBy,
  resizedLayout,
  roomAt,
  startGesture,
  type Gesture,
  type LayoutRoom,
} from "../src/model/house-grid";
import { houseEditorDe, houseEditorEn } from "../src/localize/house-editor";

const G = { cols: 12, rows: 6 };
// the ground floor of editor 2 of the mock
const ROOMS: LayoutRoom[] = [
  { key: "kueche", layout: { x: 0, y: 0, w: 4, h: 3 } },
  { key: "wohnen", layout: { x: 4, y: 0, w: 6, h: 4 } },
  { key: "flur", layout: { x: 10, y: 0, w: 2, h: 6 } },
  { key: "essen", layout: { x: 0, y: 3, w: 4, h: 3 } },
];

describe("grid geometry", () => {
  it("detects overlaps but lets touching edges pass", () => {
    expect(overlaps({ x: 0, y: 0, w: 4, h: 3 }, { x: 4, y: 0, w: 2, h: 2 })).toBe(false);
    expect(overlaps({ x: 0, y: 0, w: 4, h: 3 }, { x: 3, y: 2, w: 2, h: 2 })).toBe(true);
    expect(overlaps({ x: 0, y: 0, w: 4, h: 3 }, { x: 0, y: 3, w: 4, h: 3 })).toBe(false);
  });

  it("keeps rooms inside the grid and on whole cells", () => {
    expect(insideGrid({ x: 0, y: 0, w: 12, h: 6 }, G)).toBe(true);
    expect(insideGrid({ x: 11, y: 0, w: 2, h: 1 }, G)).toBe(false);
    expect(insideGrid({ x: -1, y: 0, w: 1, h: 1 }, G)).toBe(false);
    expect(insideGrid({ x: 0, y: 0, w: 0, h: 1 }, G)).toBe(false);
    expect(insideGrid({ x: 0.5, y: 0, w: 1, h: 1 }, G)).toBe(false);
    expect(insideGrid({ x: 0, y: 5, w: 1, h: 2 }, G)).toBe(false);
  });

  it("isFree ignores the room being changed", () => {
    const k = ROOMS[0].layout;
    expect(isFree(k, ROOMS, G)).toBe(false);
    expect(isFree(k, ROOMS, G, "kueche")).toBe(true);
  });

  it("finds the room under a point and the handle", () => {
    expect(roomAt(ROOMS, 4.0, 0.0)?.key).toBe("wohnen");
    expect(roomAt(ROOMS, 3.99, 2.99)?.key).toBe("kueche");
    expect(roomAt([{ key: "a", layout: { x: 0, y: 0, w: 1, h: 1 } }], 5, 5)).toBeUndefined();
    const l = { x: 0, y: 0, w: 4, h: 3 };
    expect(onHandle(l, 4.2, 3.2)).toBe(true);
    expect(onHandle(l, 4.3, 3.3)).toBe(false);
  });

  it("snaps points outside the grid to the edge cell", () => {
    expect(cellAt(-3, 99, G)).toEqual({ x: 0, y: 5 });
    expect(cellAt(12, 6, G)).toEqual({ x: 11, y: 5 });
    expect(cellAt(2.7, 1.1, G)).toEqual({ x: 2, y: 1 });
  });
});

describe("pointer gestures", () => {
  it("the handle wins over the room, a room over drawing", () => {
    const h = startGesture(ROOMS, "kueche", 4.1, 3.1, G);
    expect(h.gesture.mode).toBe("size");
    // the same spot without selection is in room "wohnen"? no: (4.1, 3.1) lies in wohnen (4..10 x 0..4)
    expect(startGesture(ROOMS, undefined, 4.1, 3.1, G).gesture.mode).toBe("move");
    const n = startGesture([], undefined, 5.5, 2.5, G);
    expect(n.gesture).toEqual({ mode: "new", sx: 5, sy: 2 });
    expect(n.room).toBeUndefined();
  });

  it("moves with snapping and keeps the room inside the grid", () => {
    const l = { x: 0, y: 0, w: 4, h: 3 };
    // grabbed at 1.5 / 1.5 inside the room
    expect(movedLayout(l, 3.6, 2.4, 1.5, 1.5, G)).toEqual({ x: 2, y: 1, w: 4, h: 3 });
    expect(movedLayout(l, 50, 50, 1, 1, G)).toEqual({ x: 8, y: 3, w: 4, h: 3 });
    expect(movedLayout(l, -50, -50, 1, 1, G)).toEqual({ x: 0, y: 0, w: 4, h: 3 });
  });

  it("resizes at the handle, at least 1 cell, at most to the grid edge", () => {
    const l = { x: 2, y: 1, w: 4, h: 3 };
    expect(resizedLayout(l, 7.4, 5.6, G)).toEqual({ x: 2, y: 1, w: 5, h: 5 });
    expect(resizedLayout(l, 0, 0, G)).toEqual({ x: 2, y: 1, w: 1, h: 1 });
    expect(resizedLayout(l, 99, 99, G)).toEqual({ x: 2, y: 1, w: 10, h: 5 });
  });

  it("draws a rectangle from the start cell in any direction", () => {
    expect(drawnLayout(3, 2, 5.5, 4.2, G)).toEqual({ x: 3, y: 2, w: 3, h: 3 });
    expect(drawnLayout(3, 2, 1.2, 0.1, G)).toEqual({ x: 1, y: 0, w: 3, h: 3 });
    expect(drawnLayout(3, 2, 3.4, 2.4, G)).toEqual({ x: 3, y: 2, w: 1, h: 1 });
  });

  it("drops invalid positions and keeps the last valid one", () => {
    const start = startGesture(ROOMS, undefined, 1.5, 1.5, G); // kueche, grabbed at 1.5 / 1.5
    let g: Gesture = start.gesture;
    // free move is impossible: every neighbour cell is taken, only the old place is free
    const blocked = dragTo(g, ROOMS, 3.5, 1.5, G);
    expect(blocked.layout).toBeUndefined();
    expect(blocked.gesture).toBe(g);
    // move the dragged room into the gap after "essen" was removed
    const rooms = ROOMS.filter((r) => r.key !== "essen");
    const ok = dragTo(g, rooms, 1.5, 3.5, G);
    expect(ok.layout).toEqual({ x: 0, y: 2, w: 4, h: 3 });
    g = ok.gesture;
    // then into the wall of "wohnen": dropped, the last valid layout stays in the gesture
    const bad = dragTo(g, rooms, 4.5, 3.5, G);
    expect(bad.layout).toBeUndefined();
    expect(bad.gesture).toBe(g);
  });

  it("a new room only shows where it fits", () => {
    let g: Gesture = { mode: "new", sx: 6, sy: 4 };
    g = dragTo(g, ROOMS, 8.5, 5.5, G).gesture;
    expect(g).toEqual({ mode: "new", sx: 6, sy: 4, tmp: { x: 6, y: 4, w: 3, h: 2 } });
    // reaching into "wohnen" (y < 4) is invalid: the rectangle stays as it was
    const same = dragTo(g, ROOMS, 8.5, 2.5, G).gesture;
    expect(same).toBe(g);
  });

  it("never lets a drag produce an overlap or leave the grid (random walk)", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let run = 0; run < 50; run++) {
      const rooms = ROOMS.map((r) => ({ ...r }));
      const pick = rooms[Math.floor(rnd() * rooms.length)];
      let g: Gesture = startGesture(rooms, rnd() < 0.5 ? pick.key : undefined, pick.layout.x + 0.5, pick.layout.y + 0.5, G).gesture;
      for (let i = 0; i < 40; i++) {
        const r = dragTo(g, rooms, rnd() * 14 - 1, rnd() * 8 - 1, G);
        g = r.gesture;
        if (r.layout && g.mode !== "new") {
          const key = g.key;
          rooms.find((x) => x.key === key)!.layout = r.layout;
        }
        for (const a of rooms) {
          expect(insideGrid(a.layout, G)).toBe(true);
          for (const b of rooms) if (a !== b) expect(overlaps(a.layout, b.layout)).toBe(false);
        }
      }
    }
  });
});

describe("keyboard", () => {
  it("maps arrow keys", () => {
    expect(arrowDelta("ArrowLeft")).toEqual({ dx: -1, dy: 0 });
    expect(arrowDelta("ArrowDown")).toEqual({ dx: 0, dy: 1 });
    expect(arrowDelta("a")).toBeUndefined();
  });

  it("moves and resizes by one cell when there is room", () => {
    const rooms: LayoutRoom[] = [
      { key: "a", layout: { x: 1, y: 1, w: 2, h: 2 } },
      { key: "b", layout: { x: 5, y: 1, w: 2, h: 2 } },
    ];
    expect(moveBy("a", rooms, 1, 0, G)).toEqual({ x: 2, y: 1, w: 2, h: 2 });
    expect(moveBy("a", rooms, -2, 0, G)).toBeUndefined();
    expect(resizeBy("a", rooms, 2, 0, G)).toEqual({ x: 1, y: 1, w: 4, h: 2 });
    expect(resizeBy("a", rooms, 3, 0, G)).toBeUndefined(); // would touch b
    expect(resizeBy("a", rooms, -2, 0, G)).toBeUndefined(); // width 0
    expect(moveBy("nope", rooms, 1, 0, G)).toBeUndefined();
  });
});

describe("texts", () => {
  it("has the same grid keys in German and English", () => {
    const keys = (o: object) => Object.keys(o).filter((k) => k.startsWith("house_ed_grid_")).sort();
    expect(keys(houseEditorEn)).toEqual(keys(houseEditorDe));
    expect(keys(houseEditorDe).length).toBeGreaterThan(0);
  });
});
