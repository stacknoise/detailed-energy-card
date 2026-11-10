import { SOURCE_COLORS } from "../../src/model/mix";
import {
  BRANCH_LIFT,
  CELL,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  GROUND,
  MAST,
  PITCH,
  RISER_OFFSET,
  ROOF_H,
  ROOM_H,
  ROOM_INSET,
  SLAB,
  SOLAR,
  SOLAR_COLS,
  SOLAR_ROWS,
  type HouseConfig,
  type HouseScene,
  type RoomLayout,
  type SceneBox,
  type SceneFlow,
  type SceneLabel,
  type Vec3,
} from "../../src/model/house";

/**
 * The example of the mocks (docs/mockups/3d): solar 4.2 kW, grid 0.6 kW, battery charging 1.1 kW, home 3.7 kW,
 * three floors with three rooms each on the 12 x 6 grid of "editor 2". The packages build and draw against it,
 * and the picture comparison of AP3 and AP7 uses the same values.
 */
export const MOCK_VALUES = { solar: 4.2, grid: 0.6, battery: 1.1, home: 3.7 } as const;

/** Room slots of the mock (editor 1, also the default layout): left, right, bottom row. */
export const MOCK_SLOTS: RoomLayout[] = [
  { x: 0, y: 0, w: 5, h: 3 },
  { x: 5, y: 0, w: 7, h: 3 },
  { x: 0, y: 3, w: 12, h: 3 },
];

export interface MockFloor {
  floor_id: string;
  name: string;
  kw: number;
  rooms: Array<{ area_id: string; name: string; kw: number; battery?: boolean }>;
}

export const MOCK_FLOORS: MockFloor[] = [
  {
    floor_id: "keller",
    name: "Keller",
    kw: 1.0,
    rooms: [
      { area_id: "waermepumpe", name: "Wärmepumpe", kw: 0.7 },
      { area_id: "akku", name: "Akku", kw: 1.1, battery: true },
      { area_id: "waschkueche", name: "Waschküche", kw: 0.3 },
    ],
  },
  {
    floor_id: "eg",
    name: "Erdgeschoss",
    kw: 1.9,
    rooms: [
      { area_id: "kueche", name: "Küche", kw: 1.2 },
      { area_id: "wohnzimmer", name: "Wohnzimmer", kw: 0.5 },
      { area_id: "flur", name: "Flur", kw: 0.2 },
    ],
  },
  {
    floor_id: "og",
    name: "Obergeschoss",
    kw: 0.8,
    rooms: [
      { area_id: "bad", name: "Bad", kw: 0.5 },
      { area_id: "buero", name: "Büro", kw: 0.2 },
      { area_id: "schlafzimmer", name: "Schlafzimmer", kw: 0.1 },
    ],
  },
];

/** The same example as a card config (without sensors: only structure and layout). */
export function mockConfig(): HouseConfig {
  return {
    type: "custom:detailed-energy-3d-card",
    floors: MOCK_FLOORS.map((f) => ({
      floor_id: f.floor_id,
      name: f.name,
      rooms: f.rooms.map((r, i) => ({ area_id: r.area_id, name: r.name, layout: MOCK_SLOTS[i] })),
    })),
  };
}

const kw = (n: number): string => `${n.toFixed(1).replace(".", ",")} kW`;
const WIDTH = DEFAULT_COLS * CELL;
const DEPTH = DEFAULT_ROWS * CELL;

/** The scene of the mock in world coordinates. Boxes are in drawing order (floors from the bottom, rooms by x + y, as in the mock). */
export function mockScene(): HouseScene {
  const boxes: SceneBox[] = [];
  const labels: SceneLabel[] = [];
  const flows: SceneFlow[] = [];
  const base = { selected: false, dimmed: false };
  const box = (b: Omit<SceneBox, "selected" | "dimmed">): void => void boxes.push({ ...b, ...base });
  const label = (l: Omit<SceneLabel, "dimmed">): void => void labels.push({ ...l, dimmed: false });

  box({ key: "ground", kind: "ground", tone: "ground", x: -GROUND.left, y: -GROUND.back, z: GROUND.z, w: WIDTH + GROUND.left + GROUND.right, d: DEPTH + GROUND.back + GROUND.front, h: 0 });
  MOCK_FLOORS.forEach((f, i) => {
    const zb = i * PITCH;
    box({ key: `slab:${f.floor_id}`, kind: "slab", tone: "wall", x: 0, y: 0, z: zb, w: WIDTH, d: DEPTH, h: SLAB, floor_id: f.floor_id, aria: `${f.name}, ${kw(f.kw)}` });
    f.rooms
      .map((r, j) => ({ r, l: MOCK_SLOTS[j] }))
      .sort((a, b) => a.l.x + a.l.y - b.l.x - b.l.y)
      .forEach(({ r, l }) => {
        const w = l.w * CELL - 2 * ROOM_INSET;
        const d = l.h * CELL - 2 * ROOM_INSET;
        const x = l.x * CELL + ROOM_INSET;
        const y = l.y * CELL + ROOM_INSET;
        box({ key: `room:${r.area_id}`, kind: r.battery ? "battery" : "room", tone: r.battery ? "battery" : "room", x, y, z: zb + SLAB, w, d, h: ROOM_H, floor_id: f.floor_id, area_id: r.area_id, aria: `${r.name}, ${kw(r.kw)}` });
        if (w >= 24) {
          label({ key: `label:${r.area_id}`, kind: "room", at: [x + w / 2, y + d / 2, zb + SLAB + ROOM_H + 1], anchor: "middle", name: r.name, value: r.battery ? `lädt ${kw(r.kw)}` : kw(r.kw), floor_id: f.floor_id, area_id: r.area_id });
        }
      });
    label({ key: `label:${f.floor_id}`, kind: "floor", at: [0, DEPTH, zb + SLAB / 2], anchor: "end", name: f.name, value: kw(f.kw), floor_id: f.floor_id });
  });

  const zr = MOCK_FLOORS.length * PITCH;
  box({ key: "roof", kind: "slab", tone: "wall", x: 0, y: 0, z: zr, w: WIDTH, d: DEPTH, h: ROOF_H });
  for (let a = 0; a < SOLAR_COLS; a++) {
    for (let b = 0; b < SOLAR_ROWS; b++) {
      box({ key: `solar:${a}:${b}`, kind: "solar", tone: "solar", x: SOLAR.x0 + a * SOLAR.stepX, y: SOLAR.y0 + b * SOLAR.stepY, z: zr + ROOF_H, w: SOLAR.w, d: SOLAR.d, h: SOLAR.h });
    }
  }
  label({ key: "label:solar", kind: "source", at: [0, DEPTH, zr + ROOF_H / 2], anchor: "end", name: "Solaranlage", value: kw(MOCK_VALUES.solar) });

  const mastX = 98;
  const mastY = DEPTH + 54;
  box({ key: "mast", kind: "mast", tone: "grid", x: mastX, y: mastY, z: 0, w: MAST.foot, d: MAST.foot, h: MAST.h });
  box({ key: "mast-arm", kind: "mast", tone: "grid", x: mastX - 10, y: mastY + 1, z: MAST.armZ, w: MAST.arm, d: 2, h: MAST.armH });
  label({ key: "label:grid", kind: "source", at: [mastX + 2, mastY + 2, 50], anchor: "middle", name: "Netz", value: kw(MOCK_VALUES.grid) });

  const ry = DEPTH / 2;
  const rx = WIDTH + RISER_OFFSET;
  const zl = (k: number): number => k * PITCH + SLAB + BRANCH_LIFT;
  const flow = (key: string, source: keyof typeof SOURCE_COLORS, points: Vec3[], node?: Vec3): void =>
    void flows.push({ key, points, color: SOURCE_COLORS[source], width: 2, active: true, node, dimmed: false });
  flow("solar:roof", "solar", [[WIDTH - 8, ry, zr + 4], [rx, ry, zr + 4], [rx, ry, zl(0)]], [rx, ry, zr + 4]);
  flow("solar:eg", "solar", [[rx, ry, zl(1)], [WIDTH - 8, ry, zl(1)]], [WIDTH - 8, ry, zl(1)]);
  flow("solar:og", "solar", [[rx, ry, zl(2)], [WIDTH - 8, ry, zl(2)]], [WIDTH - 8, ry, zl(2)]);
  flow("solar:keller", "solar", [[rx, ry, zl(0)], [rx, 50, zl(0)], [142, 50, zl(0)]], [142, 50, zl(0)]);
  flow("battery:keller", "battery", [[rx, ry, zl(0)], [rx, 19, zl(0)], [142, 19, zl(0)]], [142, 19, zl(0)]);
  flow("grid:keller", "grid", [[100, mastY, zl(0)], [100, 62, zl(0)]], [100, 62, zl(0)]);

  return { cols: DEFAULT_COLS, rows: DEFAULT_ROWS, boxes, labels, flows };
}
