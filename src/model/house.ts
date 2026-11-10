import { ConfigError, validateConfig, type EnergyCardConfig } from "./config";

/*
 * Contracts of the 3D card (package AP0). Types and constants are final; the functions marked "AP1" are empty
 * on purpose and are filled by the geometry package. The measures come from the mock
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

/** AP1: checks the layouts (whole numbers, inside the grid, no overlap within a floor). Returns the messages with their path; empty for now. */
export function validateLayout(_cfg: HouseConfig): string[] {
  return [];
}

/** Validates the config of the 3D card: first the energy card's `validateConfig`, then the layout. Throws like `validateConfig`. */
export function validateHouseConfig(raw: unknown): HouseConfig {
  const cfg = validateConfig(raw) as HouseConfig;
  const problems = validateLayout(cfg);
  if (problems.length) throw new ConfigError(problems[0]);
  return cfg;
}
