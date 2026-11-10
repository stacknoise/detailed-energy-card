import { describe, expect, it } from "vitest";
import {
  autoLayout,
  boxCorners,
  drawOrder,
  houseFloors,
  layoutFloor,
  layoutsOverlap,
  orderFloors,
  project,
  sceneViewBox,
  validateHouseConfig,
  validateLayout,
  viewBoxAttr,
  type HouseConfig,
  type RoomLayout,
  type SceneBox,
} from "../src/model/house";
import { MOCK_SLOTS, mockConfig, mockScene } from "./fixtures/house-scene";

type B = Pick<SceneBox, "x" | "y" | "z" | "w" | "d" | "h">;

/** small deterministic random generator */
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** Depth of the box along the viewing ray through the screen point, or undefined if the ray misses it. The ray runs along (1, 1, 1). */
function depthAt(b: B, sx: number, sy: number): number | undefined {
  // points with project() == (sx, sy): x - y = sx / cos30, x + y - 2z = 2 sy; take the family p(t) = p0 + t (1, 1, 1)
  const C = Math.cos(Math.PI / 6);
  const u = sx / C; // x - y
  const v = 2 * sy; // x + y - 2z
  // choose z = t: x = (u + v + 2t) / 2, y = (v - u + 2t) / 2
  const lo = [b.x, b.y, b.z];
  const hi = [b.x + b.w, b.y + b.d, b.z + b.h];
  const base = [(u + v) / 2, (v - u) / 2, 0];
  let t0 = -Infinity;
  let t1 = Infinity;
  for (let k = 0; k < 3; k++) {
    // coordinate k = base[k] + t (x, y: + t; z: t)
    t0 = Math.max(t0, lo[k] - base[k]);
    t1 = Math.min(t1, hi[k] - base[k]);
  }
  return t0 < t1 - 1e-9 ? (t0 + t1) / 2 : undefined;
}

describe("drawOrder", () => {
  it("puts a box behind another by one axis", () => {
    const back: B = { x: 0, y: 0, z: 0, w: 5, d: 5, h: 5 };
    const front: B = { x: 5, y: 5, z: 0, w: 5, d: 5, h: 5 };
    expect(drawOrder([front, back])).toEqual([back, front]);
    const low: B = { x: 0, y: 0, z: 0, w: 5, d: 5, h: 5 };
    const high: B = { x: 0, y: 0, z: 5, w: 5, d: 5, h: 5 };
    expect(drawOrder([high, low])).toEqual([low, high]);
  });

  it("matches a brute-force check of the covering on random layouts", () => {
    const rand = rng(42);
    for (let round = 0; round < 40; round++) {
      // floors with slabs and rooms on a grid, like the scene
      const boxes: B[] = [];
      const floors = 1 + Math.floor(rand() * 3);
      for (let f = 0; f < floors; f++) {
        const z = f * 86;
        boxes.push({ x: 0, y: 0, z, w: 150, d: 75, h: 10 });
        const placed: RoomLayout[] = [];
        for (let k = 0; k < 8; k++) {
          const w = 1 + Math.floor(rand() * 5);
          const h = 1 + Math.floor(rand() * 3);
          const l = { x: Math.floor(rand() * (13 - w)), y: Math.floor(rand() * (7 - h)), w, h };
          if (placed.some((p) => layoutsOverlap(p, l))) continue;
          placed.push(l);
          boxes.push({ x: l.x * 12.5 + 0.8, y: l.y * 12.5 + 0.8, z: z + 10, w: l.w * 12.5 - 1.6, d: l.h * 12.5 - 1.6, h: 6 + Math.floor(rand() * 20) });
        }
      }
      const order = drawOrder(boxes);
      expect(order).toHaveLength(boxes.length);
      const pos = new Map(order.map((b, i) => [b, i]));
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          // sample the screen area of the pair; where both are hit, the nearer one must come later
          for (let s = 0; s < 60; s++) {
            const [ax, ay] = project([boxes[i].x + rand() * boxes[i].w, boxes[i].y + rand() * boxes[i].d, boxes[i].z + rand() * boxes[i].h]);
            const da = depthAt(boxes[i], ax, ay);
            const db = depthAt(boxes[j], ax, ay);
            if (da === undefined || db === undefined || Math.abs(da - db) < 1e-6) continue;
            const iNearer = da > db;
            expect(pos.get(boxes[i])! > pos.get(boxes[j])!).toBe(iNearer);
          }
        }
    }
  });

  it("orders the mock scene boxes without losing any", () => {
    const sorted = drawOrder(mockScene().boxes);
    expect(sorted).toHaveLength(mockScene().boxes.length);
  });
});

describe("sceneViewBox", () => {
  it("is empty-safe", () => {
    expect(sceneViewBox({ boxes: [], labels: [], flows: [] })).toEqual({ x: 0, y: 0, w: 24, h: 24 });
  });

  it("encloses every projected corner plus the padding", () => {
    const scene = mockScene();
    const vb = sceneViewBox(scene);
    for (const b of scene.boxes)
      for (const c of boxCorners(b)) {
        const [sx, sy] = project(c);
        expect(sx).toBeGreaterThanOrEqual(vb.x + 12 - 1e-9);
        expect(sx).toBeLessThanOrEqual(vb.x + vb.w - 12 + 1e-9);
        expect(sy).toBeGreaterThanOrEqual(vb.y + 12 - 1e-9);
        expect(sy).toBeLessThanOrEqual(vb.y + vb.h - 12 + 1e-9);
      }
    expect(sceneViewBox(scene, { pad: 0 }).w).toBeCloseTo(vb.w - 24);
  });

  it("drops the room labels when narrow and formats with one decimal", () => {
    const base = { boxes: [], flows: [] };
    const label = { key: "l", kind: "room" as const, at: [0, 0, 0] as [number, number, number], anchor: "start" as const, name: "A very long room name", value: "1,0 kW", dimmed: false };
    expect(sceneViewBox({ ...base, labels: [label] }).w).toBeGreaterThan(sceneViewBox({ ...base, labels: [label] }, { narrow: true }).w);
    expect(viewBoxAttr({ x: -1.234, y: 2, w: 10.06, h: 3 })).toBe("-1.2 2 10.1 3");
  });
});

describe("autoLayout", () => {
  it("gives the mock slots for three rooms on 12 x 6", () => {
    expect(autoLayout(3)).toEqual(MOCK_SLOTS);
  });

  it("fills the grid without overlap for any count", () => {
    for (const [cols, rows] of [[12, 6], [8, 5], [3, 3], [1, 1], [20, 2]]) {
      for (let n = 0; n <= cols * rows + 2; n++) {
        const out = autoLayout(n, cols, rows);
        expect(out).toHaveLength(Math.min(n, cols * rows));
        let area = 0;
        out.forEach((l, i) => {
          expect(l.x).toBeGreaterThanOrEqual(0);
          expect(l.y).toBeGreaterThanOrEqual(0);
          expect(l.x + l.w).toBeLessThanOrEqual(cols);
          expect(l.y + l.h).toBeLessThanOrEqual(rows);
          expect(l.w).toBeGreaterThanOrEqual(1);
          expect(l.h).toBeGreaterThanOrEqual(1);
          area += l.w * l.h;
          out.slice(i + 1).forEach((o) => expect(layoutsOverlap(l, o)).toBe(false));
        });
        if (n) expect(area).toBe(cols * rows);
      }
    }
  });

  it("uses the whole grid for one room and two bands for six", () => {
    expect(autoLayout(1)).toEqual([{ x: 0, y: 0, w: 12, h: 6 }]);
    expect(autoLayout(6).map((l) => l.y)).toEqual([0, 0, 0, 3, 3, 3]);
  });
});

describe("layoutFloor", () => {
  it("keeps own layouts and puts the others on free cells", () => {
    const own = { x: 0, y: 0, w: 6, h: 6 };
    const out = layoutFloor([{ layout: own }, {}, {}]);
    expect(out[0]).toEqual(own);
    expect(out[1]).toBeDefined();
    expect(out[2]).toBeDefined();
    for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) expect(layoutsOverlap(out[a]!, out[b]!)).toBe(false);
  });

  it("leaves a room undrawn when nothing is free", () => {
    const out = layoutFloor([{ layout: { x: 0, y: 0, w: 2, h: 2 } }, {}], 2, 2);
    expect(out[1]).toBeUndefined();
  });

  it("uses autoLayout when no room has one", () => {
    expect(layoutFloor([{}, {}, {}])).toEqual(MOCK_SLOTS);
  });
});

describe("floor order", () => {
  const floors = [{ floor_id: "og" }, { floor_id: "eg" }, { floor_id: "keller" }];
  const reg = [
    { floor_id: "keller", level: -1 },
    { floor_id: "eg", level: 0 },
    { floor_id: "og", level: 1 },
  ];
  it("sorts by level when all have one", () => {
    expect(orderFloors(floors, reg).map((f) => f.floor_id)).toEqual(["keller", "eg", "og"]);
  });
  it("keeps the config order when a level is missing", () => {
    expect(orderFloors(floors, reg.slice(1)).map((f) => f.floor_id)).toEqual(["og", "eg", "keller"]);
    expect(orderFloors(floors).map((f) => f.floor_id)).toEqual(["og", "eg", "keller"]);
    expect(orderFloors(floors, [{ floor_id: "keller", level: null }, ...reg.slice(1)]).map((f) => f.floor_id)).toEqual(["og", "eg", "keller"]);
  });
  it("resolves a config into floors with layouts", () => {
    const floorsOut = houseFloors(mockConfig());
    expect(floorsOut.map((f) => f.index)).toEqual([0, 1, 2]);
    expect(floorsOut[0].rooms.map((r) => r.layout)).toEqual(MOCK_SLOTS);
  });
  it("gives one floor for a config with top-level rooms and none for an empty one", () => {
    const flat = { sources: [], rooms: [{ area_id: "a" }, { area_id: "b" }] } as unknown as HouseConfig;
    const out = houseFloors(flat);
    expect(out).toHaveLength(1);
    expect(out[0].floor_id).toBeUndefined();
    expect(out[0].rooms).toHaveLength(2);
    expect(houseFloors({} as HouseConfig)).toEqual([]);
  });
});

describe("validateLayout", () => {
  const withLayouts = (...layouts: unknown[]): HouseConfig =>
    ({ sources: [], floors: [{ floor_id: "eg", rooms: layouts.map((layout, i) => ({ area_id: `r${i}`, layout })) }] }) as unknown as HouseConfig;

  it("accepts the mock config and configs without layout", () => {
    expect(validateLayout(mockConfig())).toEqual([]);
    expect(validateLayout(withLayouts(undefined, undefined))).toEqual([]);
  });

  it("rejects non-integers, small sizes and the outside of the grid, with a path", () => {
    expect(validateLayout(withLayouts({ x: 0.5, y: 0, w: 1, h: 1 }))).toEqual(["floors[0].rooms[0].layout: x must be whole numbers (cells)"]);
    expect(validateLayout(withLayouts({ x: 0, y: 0, w: 1 }))).toEqual(["floors[0].rooms[0].layout: h must be whole numbers (cells)"]);
    expect(validateLayout(withLayouts({ x: 0, y: 0, w: 0, h: 1 }))[0]).toContain("at least 1");
    expect(validateLayout(withLayouts({ x: -1, y: 0, w: 1, h: 1 }))[0]).toContain("inside the 12 x 6 grid");
    expect(validateLayout(withLayouts({ x: 11, y: 0, w: 2, h: 1 }))[0]).toContain("inside");
    expect(validateLayout(withLayouts({ x: 0, y: 5, w: 1, h: 2 }))[0]).toContain("inside");
    expect(validateLayout(withLayouts("x"))[0]).toContain("must be an object");
  });

  it("rejects an overlap within a floor but not across floors", () => {
    expect(validateLayout(withLayouts({ x: 0, y: 0, w: 4, h: 4 }, { x: 3, y: 3, w: 4, h: 2 }))).toEqual(["floors[0].rooms[1].layout: overlaps floors[0].rooms[0].layout"]);
    expect(validateLayout(withLayouts({ x: 0, y: 0, w: 4, h: 4 }, { x: 4, y: 0, w: 4, h: 4 }))).toEqual([]);
    const two = { sources: [], floors: [{ floor_id: "a", rooms: [{ area_id: "x", layout: { x: 0, y: 0, w: 2, h: 2 } }] }, { floor_id: "b", rooms: [{ area_id: "y", layout: { x: 0, y: 0, w: 2, h: 2 } }] }] } as unknown as HouseConfig;
    expect(validateLayout(two)).toEqual([]);
  });

  it("checks the grid options and uses them for the bounds", () => {
    expect(validateLayout({ sources: [], house: { cols: 0 } } as unknown as HouseConfig)[0]).toContain("house.cols");
    expect(validateLayout({ sources: [], house: { rows: 2.5 } } as unknown as HouseConfig)[0]).toContain("house.rows");
    expect(validateLayout({ sources: [], house: [] } as unknown as HouseConfig)[0]).toContain("house:");
    const small = { sources: [], house: { cols: 4, rows: 2 }, rooms: [{ area_id: "a", layout: { x: 0, y: 0, w: 5, h: 1 } }] } as unknown as HouseConfig;
    expect(validateLayout(small)[0]).toContain("inside the 4 x 2 grid");
  });

  it("makes validateHouseConfig throw the first problem", () => {
    expect(() => validateHouseConfig({ sources: [{ type: "solar", entity: "sensor.a" }], rooms: [{ area_id: "a", layout: { x: 20, y: 0, w: 1, h: 1 } }] })).toThrow(/rooms\[0\]\.layout/);
    expect(validateHouseConfig(mockConfig())).toBeTruthy();
  });
});
