import type { EnergyCardConfig, RoomConfig } from "../model/config";
import { DEFAULT_COLS, DEFAULT_ROWS, gridOf, layoutProblem, layoutsOverlap, validateLayout, type GridRoom, type HouseConfig, type RoomLayout } from "../model/house";
import { stateToWatts, formatPower, type StateLike } from "../model/units";
import { GRID_LIMITS } from "./schema";
import { updateIn, type Pointer } from "./config-utils";

/*
 * Pure logic of the 3D card's editor (AP6): which rooms sit on which floor, whether a layout fits, how rooms are
 * added, changed and removed. No DOM, so it is tested with Vitest. The pointer and touch handling of the grid
 * itself belongs to AP5 (`<detailed-energy-house-grid>`); the checks here only guard the form fields.
 */

/** Value of the area choice that stands for a room without a Home Assistant area. */
export const CUSTOM_AREA = "__custom__";

/** A floor tab: the floor id (empty for the rooms without floors), where its rooms are in the config and the rooms. */
export interface FloorView {
  floor_id: string;
  /** pointer to the room list: `["floors", i, "rooms"]`, or `["rooms"]` while the config has no floors */
  rooms_ptr: Pointer;
  rooms: RoomConfig[];
}

/** The floors the editor shows as tabs; a config without floors has one tab with its rooms. */
export function floorViews(cfg: Pick<EnergyCardConfig, "floors" | "rooms">): FloorView[] {
  if (cfg.floors) {
    return cfg.floors.map((f, i) => ({ floor_id: f.floor_id, rooms_ptr: ["floors", i, "rooms"], rooms: f.rooms ?? [] }));
  }
  return [{ floor_id: "", rooms_ptr: ["rooms"], rooms: cfg.rooms ?? [] }];
}

/** True when two layouts share at least one cell. */
export const overlaps = layoutsOverlap;

const whole = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

/** True when `layout` is made of whole cells, lies inside the grid and overlaps none of `others` (the checks of `validateLayout`). */
export function layoutFits(layout: RoomLayout, others: readonly RoomLayout[], cols: number, rows: number): boolean {
  return layoutProblem(layout, cols, rows) === undefined && !others.some((o) => layoutsOverlap(layout, o));
}

/** The layouts of the rooms of a floor, without the room `except` (by area id). */
export function layoutsOf(rooms: readonly RoomConfig[], except?: string): RoomLayout[] {
  return rooms.filter((r) => r.layout && r.area_id !== except).map((r) => r.layout!);
}

/** The first free place for a room of up to `w` x `h` cells (shrinking to 1 x 1), scanning row by row; undefined if the floor is full. */
export function freeSpot(others: readonly RoomLayout[], cols: number, rows: number, w = 2, h = 2): RoomLayout | undefined {
  for (let ww = w, hh = h; ww >= 1 && hh >= 1; ww--, hh--) {
    for (let y = 0; y + hh <= rows; y++) {
      for (let x = 0; x + ww <= cols; x++) {
        const cand = { x, y, w: ww, h: hh };
        if (layoutFits(cand, others, cols, rows)) return cand;
      }
    }
  }
  return undefined;
}

/** The smallest grid that still holds every placed room, for refusing a grid that is too small. */
export function minGrid(cfg: Pick<EnergyCardConfig, "floors" | "rooms">): { cols: number; rows: number } {
  let cols: number = GRID_LIMITS.cols[0];
  let rows: number = GRID_LIMITS.rows[0];
  for (const f of floorViews(cfg)) {
    for (const r of f.rooms) {
      if (!r.layout) continue;
      cols = Math.max(cols, r.layout.x + r.layout.w);
      rows = Math.max(rows, r.layout.y + r.layout.h);
    }
  }
  return { cols, rows };
}

/** Sets `house.cols` / `house.rows`; the default value is not written. Returns undefined when a placed room would not fit anymore or the value is out of range. */
export function withGrid(cfg: HouseConfig, key: "cols" | "rows", value: number): HouseConfig | undefined {
  const [min, max] = GRID_LIMITS[key];
  if (!whole(value) || value < min || value > max) return undefined;
  if (value < minGrid(cfg)[key]) return undefined;
  const next = { ...gridOf(cfg), [key]: value };
  const house = {
    ...(next.cols !== DEFAULT_COLS ? { cols: next.cols } : {}),
    ...(next.rows !== DEFAULT_ROWS ? { rows: next.rows } : {}),
  };
  const { house: _old, ...rest } = cfg;
  return Object.keys(house).length ? { ...rest, house } : (rest as HouseConfig);
}

/** Replaces the room with `areaId` at the list `ptr` by the result of `fn`. */
function updateRoom(cfg: HouseConfig, ptr: Pointer, areaId: string, fn: (r: RoomConfig) => RoomConfig): HouseConfig {
  return updateIn(cfg, ptr, (list: RoomConfig[] | undefined) => (list ?? []).map((r) => (r.area_id === areaId ? fn(r) : r)));
}

/** Gives a room a new position and size. Returns undefined when it does not fit (outside the grid, overlapping, not whole cells). */
export function withRoomLayout(cfg: HouseConfig, floor: FloorView, areaId: string, layout: RoomLayout): HouseConfig | undefined {
  const { cols, rows } = gridOf(cfg);
  if (!layoutFits(layout, layoutsOf(floor.rooms, areaId), cols, rows)) return undefined;
  return updateRoom(cfg, floor.rooms_ptr, areaId, (r) => ({ ...r, layout: { x: layout.x, y: layout.y, w: layout.w, h: layout.h } }));
}

/** The next free id for a room without a Home Assistant area: `custom_1`, `custom_2` ... */
export function nextCustomId(used: readonly string[]): string {
  let n = 1;
  while (used.includes(`custom_${n}`)) n++;
  return `custom_${n}`;
}

/** Every area id used by a room of the config, on any floor. */
export function usedAreaIds(cfg: Pick<EnergyCardConfig, "floors" | "rooms">): string[] {
  return floorViews(cfg).flatMap((f) => f.rooms.map((r) => r.area_id));
}

/**
 * Adds a drawn room to a floor. `areaId` is a Home Assistant area, or `CUSTOM_AREA` for a room that is none: it gets a
 * fresh id and `name`. Returns undefined when the rectangle does not fit or the area is already used.
 */
export function withNewRoom(cfg: HouseConfig, floor: FloorView, areaId: string, layout: RoomLayout, name: string): { cfg: HouseConfig; area_id: string } | undefined {
  const { cols, rows } = gridOf(cfg);
  if (!layoutFits(layout, layoutsOf(floor.rooms), cols, rows)) return undefined;
  const used = usedAreaIds(cfg);
  const custom = areaId === CUSTOM_AREA;
  if (!custom && (!areaId || used.includes(areaId))) return undefined;
  const id = custom ? nextCustomId(used) : areaId;
  const room: RoomConfig = { area_id: id, ...(custom ? { name } : {}), consumers: [], layout: { x: layout.x, y: layout.y, w: layout.w, h: layout.h } };
  return { cfg: updateIn(cfg, floor.rooms_ptr, (l: RoomConfig[] | undefined) => [...(l ?? []), room]), area_id: id };
}

/** Removes a room (with its consumers) from a floor. */
export function withoutRoom(cfg: HouseConfig, floor: FloorView, areaId: string): HouseConfig {
  return updateIn(cfg, floor.rooms_ptr, (l: RoomConfig[] | undefined) => (l ?? []).filter((r) => r.area_id !== areaId));
}

/** Areas that may still get a room, those of the floor first, then the others; each keeps the order of the registry. */
export function areaChoices(
  areas: ReadonlyArray<{ area_id: string; name: string; floor_id?: string | null }>,
  used: readonly string[],
  floorId: string,
): Array<{ value: string; label: string }> {
  const free = areas.filter((a) => !used.includes(a.area_id));
  const own = free.filter((a) => floorId && a.floor_id === floorId);
  const rest = free.filter((a) => !own.includes(a));
  return [...own, ...rest].map((a) => ({ value: a.area_id, label: a.name }));
}

/** Current power of a room in W from its own meter, else from its consumers; undefined if no sensor can be read. */
export function roomWatts(room: RoomConfig, states: Record<string, StateLike | undefined>): number | undefined {
  const own = room.entity ? stateToWatts(states[room.entity]) : null;
  if (own !== null) return own;
  let sum: number | undefined;
  for (const c of room.consumers ?? []) {
    const w = c.entity ? stateToWatts(states[c.entity]) : null;
    if (w !== null) sum = (sum ?? 0) + w;
  }
  return sum;
}

/** The placed rooms of a floor as the grid component shows them. `name` resolves the area id to a display name. */
export function gridRooms(rooms: readonly RoomConfig[], name: (r: RoomConfig) => string, states: Record<string, StateLike | undefined>, lang?: string): GridRoom[] {
  return rooms
    .filter((r) => r.layout)
    .map((r) => {
      const w = roomWatts(r, states);
      return { key: r.area_id, name: name(r), ...(w === undefined ? {} : { value: formatPower(w, "auto", 2, lang) }), layout: r.layout! };
    });
}

/** The rooms of a floor that have no place on the grid yet (the energy card needs none; the 3D card then arranges them by itself). */
export function unplacedRooms(rooms: readonly RoomConfig[]): RoomConfig[] {
  return rooms.filter((r) => !r.layout);
}

/**
 * A config that just lost its floors has the rooms of all floors in one list, and rooms of different floors often sit at
 * the same cells. Then the positions are dropped, so the 3D card arranges the rooms by itself instead of reporting an overlap.
 */
export function withoutClashingLayouts(cfg: HouseConfig): HouseConfig {
  if (cfg.floors || !cfg.rooms?.some((r) => r.layout) || !validateLayout(cfg).length) return cfg;
  return { ...cfg, rooms: cfg.rooms.map(({ layout: _layout, ...room }) => room) };
}
