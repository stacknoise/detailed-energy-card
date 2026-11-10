import { ConfigError, validateConfig, type EnergyCardConfig, type RoomConfig } from "./config";
import type { FloorEntry } from "./registry";

/*
 * Contracts of the 3D card (package AP0) and its geometry (package AP1): projection, view box, draw order,
 * automatic layout, floor order and the layout validation. The measures come from the mock
 * docs/mockups/3d/house-view-mock.html and the editor mock; a deviation needs a reason in the PR.
 */

/** Local-storage prefix of the 3D card. It must not start with `detailed-energy-card:`, `removeLegacyKeys` deletes those. */
export const HOUSE_STORAGE_PREFIX = "detailed-energy-house:";
/** Name of the custom element and type of the card in the dashboard. */
export const HOUSE_CARD_TYPE = "detailed-energy-3d-card";

/** cos 30°, the horizontal factor of the isometric projection. */
export const COS30 = Math.cos(Math.PI / 6);
/** Edge of one grid cell in scene units. */
export const CELL = 12.5;
/** Grid of the whole house in cells (12 x 6 cells = 150 x 75 units). */
export const DEFAULT_COLS = 12;
export const DEFAULT_ROWS = 6;
/** Thickness of a floor slab. */
export const SLAB = 10;
/** Vertical distance of two floors (the floors float, as in variant A). */
export const PITCH = 86;
/** Height of a room block and its inset from the cell edge on every side. */
export const ROOM_H = 6;
export const ROOM_INSET = 0.8;
/** Roof slab and the solar modules on it: 3 x 2 modules of 40 x 28, height 2, offset 8/6, step 46/32. */
export const ROOF_H = 6;
export const SOLAR_COLS = 3;
export const SOLAR_ROWS = 2;
export const SOLAR = { w: 40, d: 28, h: 2, x0: 8, y0: 6, stepX: 46, stepY: 32 } as const;
/** Riser: distance to the right of the house; branches sit this far above the slab top. */
export const RISER_OFFSET = 14;
export const BRANCH_LIFT = 3;
/** Grid pole in front of the house: foot 4 x 4, height 46, cross arm 24 wide. */
export const MAST = { foot: 4, h: 46, arm: 24, armH: 2, armZ: 40 } as const;
/** Ground plate under the house: margin left/back/right/front and its z. */
export const GROUND = { left: 40, back: 30, right: 70, front: 30, z: -6 } as const;
/** Below this card width in px the graphic omits the room labels; the detail list carries the values. */
export const NARROW_PX = 500;
/** Radius of the end nodes of the flow lines. */
export const NODE_R = 2.6;

/** Position and size of a room on the grid, in whole cells. */
export interface RoomLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The grid of the house; both default to 12 x 6 and apply to all floors. */
export interface HouseOptions {
  cols?: number;
  rows?: number;
}

/** Configuration of the 3D card: that of the energy card (`sources`, `floors`, `rooms`, `consumers` ...) plus `house` and `layout` per room. */
export type HouseConfig = EnergyCardConfig & { house?: HouseOptions };

/** A point in the world: x and y on the ground, z up. */
export type Vec3 = [number, number, number];

/** Parts of the scene a viewer can pick; the rest is decoration. */
export type BoxKind = "ground" | "slab" | "room" | "roof" | "solar" | "battery" | "mast";
/** Face color group of a box (top light, left medium, right dark, derived from theme variables). */
export type BoxTone = "ground" | "wall" | "room" | "solar" | "battery" | "grid";

/** A cuboid; the view draws top, left and right face from it. */
export interface SceneBox {
  key: string;
  kind: BoxKind;
  tone: BoxTone;
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  floor_id?: string;
  area_id?: string;
  selected: boolean;
  dimmed: boolean;
  /** text for screen readers (name and value), set on picked parts */
  aria?: string;
}

/** Two-line label: name normal, value bold. */
export interface SceneLabel {
  key: string;
  /** `room` labels are dropped below NARROW_PX */
  kind: "room" | "floor" | "source";
  at: Vec3;
  anchor: "start" | "middle" | "end";
  name: string;
  value: string;
  floor_id?: string;
  area_id?: string;
  dimmed: boolean;
}

/** A flow line: a polyline in world coordinates with its color and width from the thresholds and source colors. */
export interface SceneFlow {
  key: string;
  points: Vec3[];
  color: string;
  width: number;
  /** moves (dashes run); false for an idle line */
  active: boolean;
  /** end node, drawn as a circle */
  node?: Vec3;
  dimmed: boolean;
}

/** Output of the scene builder, input of the view. Boxes are sorted back to front, the view draws them in this order. */
export interface HouseScene {
  cols: number;
  rows: number;
  boxes: SceneBox[];
  labels: SceneLabel[];
  flows: SceneFlow[];
}

/** What is selected on the card; both unset means nothing. */
export interface HouseSelection {
  floor_id?: string;
  area_id?: string;
}

/** A room as the grid component shows it: a key (the area id, or a temporary id for a new room), display name, optional value text. */
export interface GridRoom {
  key: string;
  name: string;
  value?: string;
  layout: RoomLayout;
}

/** Events of `<detailed-energy-house-grid>`; each carries this `detail`. */
export interface HouseGridEventMap {
  /** a room was moved or resized: its new layout */
  "room-change": { key: string; layout: RoomLayout };
  /** a new room was drawn: its rectangle (the editor then asks for the area) */
  "room-add": { layout: RoomLayout };
  "room-delete": { key: string };
  /** `key` is undefined when the selection is cleared */
  "room-select": { key?: string };
}

/** The scene with no content, for a card without rooms and for tests. */
export function emptyScene(cols = DEFAULT_COLS, rows = DEFAULT_ROWS): HouseScene {
  return { cols, rows, boxes: [], labels: [], flows: [] };
}

/** Isometric projection: ((x - y) cos 30°, (x + y) / 2 - z). */
export function project([x, y, z]: Vec3): [number, number] {
  return [(x - y) * COS30, (x + y) * 0.5 - z];
}

/** Grid of the house with defaults applied. */
export function gridOf(cfg: Pick<HouseConfig, "house">): { cols: number; rows: number } {
  return { cols: cfg.house?.cols ?? DEFAULT_COLS, rows: cfg.house?.rows ?? DEFAULT_ROWS };
}

/** Padding around the drawing in the view box (the mock fits its SVG with 12). */
export const VIEW_PAD = 12;
/** Font sizes of the labels: rooms and sources 7, floors 8; `CHAR_W` is the assumed glyph width in em for the text extent. */
export const LABEL_SIZE = 7;
export const FLOOR_LABEL_SIZE = 8;
export const CHAR_W = 0.55;
/** Largest grid a config may ask for (cells per side). */
export const MAX_GRID = 40;

/** The view box of the graphic in screen units. */
export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The eight corners of a box in the world. */
export function boxCorners(b: Pick<SceneBox, "x" | "y" | "z" | "w" | "d" | "h">): Vec3[] {
  const out: Vec3[] = [];
  for (const dx of [0, b.w]) for (const dy of [0, b.d]) for (const dz of [0, b.h]) out.push([b.x + dx, b.y + dy, b.z + dz]);
  return out;
}

/** Estimated extent of a two-line label on the screen (corners, no font metrics needed, so it is testable). */
function labelPoints(l: SceneLabel): [number, number][] {
  const size = l.kind === "floor" ? FLOOR_LABEL_SIZE : LABEL_SIZE;
  const width = Math.max(l.name.length, l.value.length) * size * CHAR_W;
  const [sx, sy] = project(l.at);
  const left = l.anchor === "start" ? sx : l.anchor === "end" ? sx - width : sx - width / 2;
  return [
    [left, sy - size],
    [left + width, sy + size * 1.4],
  ];
}

/**
 * View box of a scene, computed from the geometry (not with `getBBox`, so it is testable and does not flicker):
 * the projected corners of all boxes, the flow lines with their end nodes and the estimated label extents, plus `pad`.
 * `narrow` leaves the room labels out, as the graphic does below NARROW_PX.
 */
export function sceneViewBox(scene: Pick<HouseScene, "boxes" | "labels" | "flows">, opts: { narrow?: boolean; pad?: number } = {}): ViewBox {
  const pad = opts.pad ?? VIEW_PAD;
  const pts: [number, number][] = [];
  for (const b of scene.boxes) for (const c of boxCorners(b)) pts.push(project(c));
  for (const f of scene.flows) {
    for (const p of f.points) pts.push(project(p));
    if (f.node) {
      const [nx, ny] = project(f.node);
      pts.push([nx - NODE_R, ny - NODE_R], [nx + NODE_R, ny + NODE_R]);
    }
  }
  for (const l of scene.labels) if (!(opts.narrow && l.kind === "room")) pts.push(...labelPoints(l));
  if (!pts.length) return { x: 0, y: 0, w: 2 * pad, h: 2 * pad };
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs) - pad;
  const y0 = Math.min(...ys) - pad;
  return { x: x0, y: y0, w: Math.max(...xs) + pad - x0, h: Math.max(...ys) + pad - y0 };
}

/** The `viewBox` attribute for a view box, with one decimal like the mock. */
export function viewBoxAttr(vb: ViewBox): string {
  return [vb.x, vb.y, vb.w, vb.h].map((n) => (Math.round(n * 10) / 10).toString()).join(" ");
}

type Extent = Pick<SceneBox, "x" | "y" | "z" | "w" | "d" | "h">;

/** True when no part of `a` can cover a part of `b` seen from the viewer: `a` lies wholly below, left of or behind `b` along one axis. */
function separatedBelow(a: Extent, b: Extent): boolean {
  return a.x + a.w <= b.x || a.y + a.d <= b.y || a.z + a.h <= b.z;
}

/**
 * Draw order of boxes, back to front: a topological sort. `A` is drawn before `B` when `A` lies behind `B`
 * (`A.x + A.w <= B.x` or `A.y + A.d <= B.y`, or `A` is wholly below `B`). Two boxes that are separated both ways
 * do not overlap on the screen, so they have no order between them. Ties (and cycles, which grid-aligned boxes
 * do not produce) fall back to the sum of the near corner, then to the input order. Returns a new array.
 */
export function drawOrder<T extends Pick<SceneBox, "x" | "y" | "z" | "w" | "d" | "h">>(boxes: readonly T[]): T[] {
  const n = boxes.length;
  const before: number[][] = boxes.map(() => []);
  const waiting = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (separatedBelow(boxes[i], boxes[j]) && !separatedBelow(boxes[j], boxes[i])) {
        before[i].push(j);
        waiting[j]++;
      }
    }
  const key = (i: number) => boxes[i].x + boxes[i].y + boxes[i].z;
  const done = new Array<boolean>(n).fill(false);
  const out: T[] = [];
  for (let k = 0; k < n; k++) {
    let pick = -1;
    for (let i = 0; i < n; i++) {
      if (done[i] || waiting[i] > 0) continue;
      if (pick < 0 || key(i) < key(pick)) pick = i;
    }
    if (pick < 0) for (let i = 0; i < n; i++) if (!done[i] && (pick < 0 || key(i) < key(pick))) pick = i; // cycle: should not happen
    done[pick] = true;
    out.push(boxes[pick]);
    for (const j of before[pick]) waiting[j]--;
  }
  return out;
}

/** Splits `total` into `parts` whole numbers that differ by at most one, the larger parts first. */
function splitEven(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const extra = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Layout for `count` rooms on a grid when none has an own one: bands (rows of rooms) of near equal height, the
 * first bands holding more rooms. Three rooms give the mock's slots (two above, one below, the upper pair split 5 : 7
 * on 12 columns). At most `cols * rows` layouts are returned; further rooms do not fit.
 */
export function autoLayout(count: number, cols = DEFAULT_COLS, rows = DEFAULT_ROWS): RoomLayout[] {
  const n = Math.min(Math.max(0, Math.floor(count)), cols * rows);
  if (!n) return [];
  if (n === 3 && cols >= 2 && rows >= 2) {
    const cx = Math.min(cols - 1, Math.max(1, Math.round((cols * 5) / 12)));
    const cy = Math.min(rows - 1, Math.max(1, Math.round(rows / 2)));
    return [
      { x: 0, y: 0, w: cx, h: cy },
      { x: cx, y: 0, w: cols - cx, h: cy },
      { x: 0, y: cy, w: cols, h: rows - cy },
    ];
  }
  const bands = Math.min(rows, n, Math.max(Math.ceil(n / cols), Math.round(Math.sqrt((n * rows) / cols))));
  const perBand = splitEven(n, bands);
  const heights = splitEven(rows, bands);
  const out: RoomLayout[] = [];
  let y = 0;
  perBand.forEach((k, b) => {
    let x = 0;
    for (const w of splitEven(cols, k)) {
      out.push({ x, y, w, h: heights[b] });
      x += w;
    }
    y += heights[b];
  });
  return out;
}

/** True when two layouts share at least one cell. */
export function layoutsOverlap(a: RoomLayout, b: RoomLayout): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Looks for a free place for a room next to the fixed ones: the preferred size first, then smaller; scanned row by row. */
function findFree(taken: RoomLayout[], cols: number, rows: number): RoomLayout | undefined {
  for (let size = Math.min(cols, 4) * 100 + Math.min(rows, 2); size > 0; ) {
    const w = Math.floor(size / 100);
    const h = size % 100;
    for (let y = 0; y + h <= rows; y++)
      for (let x = 0; x + w <= cols; x++) {
        const cand = { x, y, w, h };
        if (!taken.some((t) => layoutsOverlap(t, cand))) return cand;
      }
    // shrink: height first, then width
    size = h > 1 ? w * 100 + (h - 1) : w > 1 ? (w - 1) * 100 + Math.min(rows, 2) : 0;
  }
  return undefined;
}

/**
 * Layouts of the rooms of one floor, in the order of `rooms`. A room with an own `layout` keeps it. If none has one,
 * `autoLayout` places them all. If only some have one, the others take free cells next to them (first fit); a room
 * for which nothing is free gets `undefined` and is not drawn.
 */
export function layoutFloor(rooms: readonly Pick<RoomConfig, "layout">[], cols = DEFAULT_COLS, rows = DEFAULT_ROWS): (RoomLayout | undefined)[] {
  if (rooms.every((r) => !r.layout)) {
    const auto = autoLayout(rooms.length, cols, rows);
    return rooms.map((_, i) => auto[i]);
  }
  const taken: RoomLayout[] = rooms.flatMap((r) => (r.layout ? [r.layout] : []));
  return rooms.map((r) => {
    if (r.layout) return r.layout;
    const free = findFree(taken, cols, rows);
    if (free) taken.push(free);
    return free;
  });
}

/** One floor of the house, bottom first, with the layout of each of its rooms. */
export interface HouseFloor {
  /** undefined for the rooms of a config without floors */
  floor_id?: string;
  /** 0 is the lowest floor */
  index: number;
  rooms: { room: RoomConfig; layout: RoomLayout }[];
}

/**
 * Floors from bottom to top: by the `level` of the Home Assistant registry when every floor has one (a lower level
 * is lower), otherwise in the order of the config, whose first floor is the bottom one. The sort is stable.
 */
export function orderFloors<T extends { floor_id: string }>(floors: readonly T[], registry: readonly Pick<FloorEntry, "floor_id" | "level">[] = []): T[] {
  const level = new Map(registry.map((f) => [f.floor_id, f.level]));
  const levels = floors.map((f) => level.get(f.floor_id));
  if (!floors.length || levels.some((l) => typeof l !== "number")) return [...floors];
  return floors.map((f, i) => ({ f, l: levels[i] as number, i })).sort((a, b) => a.l - b.l || a.i - b.i).map((e) => e.f);
}

/**
 * The floors of a config with all layouts resolved (own, automatic or free cells), bottom to top. A config with
 * top-level `rooms` and no `floors` gives one floor. Rooms that do not fit on the grid are left out.
 */
export function houseFloors(cfg: HouseConfig, registry: readonly Pick<FloorEntry, "floor_id" | "level">[] = []): HouseFloor[] {
  const { cols, rows } = gridOf(cfg);
  const groups: { floor_id?: string; rooms: RoomConfig[] }[] = cfg.floors?.length
    ? orderFloors(cfg.floors, registry).map((f) => ({ floor_id: f.floor_id, rooms: f.rooms ?? [] }))
    : cfg.rooms?.length
      ? [{ rooms: cfg.rooms }]
      : [];
  return groups.map((g, index) => {
    const layouts = layoutFloor(g.rooms, cols, rows);
    return {
      floor_id: g.floor_id,
      index,
      rooms: g.rooms.flatMap((room, i) => (layouts[i] ? [{ room, layout: layouts[i] as RoomLayout }] : [])),
    };
  });
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/**
 * Why `raw` is no valid layout on a `cols` x `rows` grid (not an object, not whole cells, smaller than 1 x 1, outside the
 * grid), or undefined when it is one. Overlaps are not checked here. The one check behind `validateLayout` and the
 * editor's form fields.
 */
export function layoutProblem(raw: unknown, cols: number, rows: number): string | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return "must be an object with x, y, w and h";
  const l = raw as Record<string, unknown>;
  const bad = (["x", "y", "w", "h"] as const).filter((k) => !isInt(l[k]));
  if (bad.length) return `${bad.join(", ")} must be whole numbers (cells)`;
  const { x, y, w, h } = l as unknown as RoomLayout;
  if (w < 1 || h < 1) return "w and h must be at least 1";
  if (x < 0 || y < 0 || x + w > cols || y + h > rows) return `must lie inside the ${cols} x ${rows} grid`;
  return undefined;
}

/** Checks the grid of `house` and the layouts (whole numbers, at least 1 x 1, inside the grid, no overlap within a floor). Returns the messages with their path, empty if all is well. */
export function validateLayout(cfg: HouseConfig): string[] {
  const out: string[] = [];
  const house = cfg.house as unknown;
  if (house !== undefined && (house === null || typeof house !== "object" || Array.isArray(house))) out.push("house: must be an object with `cols` and `rows`");
  for (const key of ["cols", "rows"] as const) {
    const v = (house as Record<string, unknown> | undefined)?.[key];
    if (v !== undefined && !(isInt(v) && v >= 1 && v <= MAX_GRID)) out.push(`house.${key}: must be a whole number from 1 to ${MAX_GRID}`);
  }
  if (out.length) return out;
  const { cols, rows } = gridOf(cfg);
  const check = (rooms: RoomConfig[] | undefined, prefix: string) => {
    const placed: { at: string; layout: RoomLayout }[] = [];
    (rooms ?? []).forEach((room, i) => {
      const at = `${prefix}[${i}]`;
      const raw = room.layout as unknown;
      if (raw === undefined) return;
      const problem = layoutProblem(raw, cols, rows);
      if (problem) return void out.push(`${at}.layout: ${problem}`);
      const { x, y, w, h } = raw as RoomLayout;
      const hit = placed.find((p) => layoutsOverlap(p.layout, { x, y, w, h }));
      if (hit) return void out.push(`${at}.layout: overlaps ${hit.at}.layout`);
      placed.push({ at, layout: { x, y, w, h } });
    });
  };
  check(cfg.rooms, "rooms");
  (cfg.floors ?? []).forEach((f, i) => check(f.rooms, `floors[${i}].rooms`));
  return out;
}

/** Validates the config of the 3D card: first the energy card's `validateConfig`, then the layout. Throws like `validateConfig`. */
export function validateHouseConfig(raw: unknown): HouseConfig {
  const cfg = validateConfig(raw) as HouseConfig;
  const problems = validateLayout(cfg);
  if (problems.length) throw new ConfigError(problems[0]);
  return cfg;
}
