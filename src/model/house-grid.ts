import { layoutProblem, layoutsOverlap, type RoomLayout } from "./house";

/*
 * Pure logic of the floor-plan grid (AP5): snapping, collision, creating, moving, resizing and the keys.
 * No DOM and no Lit, so everything here is tested with Vitest. Coordinates are in cells (a point is a float,
 * a layout is whole cells). An invalid position is dropped: the functions return `undefined` and the caller
 * keeps the last valid state, as in the mock ("editor 2").
 */

/** The grid in cells. */
export interface GridSize {
  cols: number;
  rows: number;
}

/** A room as far as the logic needs it. */
export interface LayoutRoom {
  key: string;
  layout: RoomLayout;
}

/** The resize handle grabs a pointer closer than this many cells to the bottom-right corner of the selected room. */
export const HANDLE_REACH = 0.3;

/** Limits `v` to `[lo, hi]`. */
export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** True when the two rectangles share at least one cell (the check of `validateLayout`). */
export const overlaps = layoutsOverlap;

/** True when `l` consists of whole cells, has a size of at least 1 and lies inside the grid (the check of `validateLayout`). */
export function insideGrid(l: RoomLayout, g: GridSize): boolean {
  return layoutProblem(l, g.cols, g.rows) === undefined;
}

/** True when `l` lies inside the grid and overlaps no room except `ignore` (the room being changed). */
export function isFree(l: RoomLayout, rooms: readonly LayoutRoom[], g: GridSize, ignore?: string): boolean {
  return insideGrid(l, g) && !rooms.some((r) => r.key !== ignore && overlaps(l, r.layout));
}

/** The room under a point (in cells), or undefined. */
export function roomAt(rooms: readonly LayoutRoom[], px: number, py: number): LayoutRoom | undefined {
  return rooms.find((r) => px >= r.layout.x && px < r.layout.x + r.layout.w && py >= r.layout.y && py < r.layout.y + r.layout.h);
}

/** True when the point is on the resize handle of `l` (its bottom-right corner). */
export function onHandle(l: RoomLayout, px: number, py: number): boolean {
  return Math.hypot(px - (l.x + l.w), py - (l.y + l.h)) < HANDLE_REACH;
}

/** The cell a point is in; points outside the grid snap to the nearest edge cell. */
export function cellAt(px: number, py: number, g: GridSize): { x: number; y: number } {
  return { x: Math.floor(clamp(px, 0, g.cols - 0.01)), y: Math.floor(clamp(py, 0, g.rows - 0.01)) };
}

/** What a drag does. */
export type Gesture =
  | { mode: "size"; key: string; layout: RoomLayout }
  | { mode: "move"; key: string; layout: RoomLayout; ox: number; oy: number }
  | { mode: "new"; sx: number; sy: number; tmp?: RoomLayout };

/**
 * What a pointer press does: the handle of the selected room if it is hit (within 0.3 cell), else move the room
 * under the pointer, else draw a new room starting in this cell. `room` is the key of the room under the pointer.
 */
export function startGesture(
  rooms: readonly LayoutRoom[],
  selected: string | undefined,
  px: number,
  py: number,
  g: GridSize,
): { gesture: Gesture; room?: string } {
  const sel = selected === undefined ? undefined : rooms.find((r) => r.key === selected);
  if (sel && onHandle(sel.layout, px, py)) return { gesture: { mode: "size", key: sel.key, layout: sel.layout }, room: sel.key };
  const hit = roomAt(rooms, px, py);
  if (hit) {
    return {
      gesture: { mode: "move", key: hit.key, layout: hit.layout, ox: px - hit.layout.x, oy: py - hit.layout.y },
      room: hit.key,
    };
  }
  const c = cellAt(px, py, g);
  return { gesture: { mode: "new", sx: c.x, sy: c.y } };
}

/** The layout of a room dragged by the pointer (`ox`, `oy`: where inside the room it was grabbed), snapped and kept inside the grid. */
export function movedLayout(l: RoomLayout, px: number, py: number, ox: number, oy: number, g: GridSize): RoomLayout {
  return {
    ...l,
    x: clamp(Math.round(px - ox), 0, g.cols - l.w),
    y: clamp(Math.round(py - oy), 0, g.rows - l.h),
  };
}

/** The layout of a room resized so its bottom-right corner snaps to the pointer (at least 1 cell, inside the grid). */
export function resizedLayout(l: RoomLayout, px: number, py: number, g: GridSize): RoomLayout {
  return {
    ...l,
    w: clamp(Math.round(px) - l.x, 1, g.cols - l.x),
    h: clamp(Math.round(py) - l.y, 1, g.rows - l.y),
  };
}

/** The rectangle drawn from the start cell to the cell under the pointer. */
export function drawnLayout(sx: number, sy: number, px: number, py: number, g: GridSize): RoomLayout {
  const c = cellAt(px, py, g);
  return { x: Math.min(sx, c.x), y: Math.min(sy, c.y), w: Math.abs(c.x - sx) + 1, h: Math.abs(c.y - sy) + 1 };
}

/**
 * Applies a pointer move to the gesture. Returns the next gesture and, for move and resize, the new layout of the room
 * when it is valid (`layout`). An invalid position changes nothing: the last valid state stays.
 */
export function dragTo(
  gesture: Gesture,
  rooms: readonly LayoutRoom[],
  px: number,
  py: number,
  g: GridSize,
): { gesture: Gesture; layout?: RoomLayout } {
  if (gesture.mode === "new") {
    const c = drawnLayout(gesture.sx, gesture.sy, px, py, g);
    return { gesture: isFree(c, rooms, g) ? { ...gesture, tmp: c } : gesture };
  }
  const next =
    gesture.mode === "move"
      ? movedLayout(gesture.layout, px, py, gesture.ox, gesture.oy, g)
      : resizedLayout(gesture.layout, px, py, g);
  if (!isFree(next, rooms, g, gesture.key)) return { gesture };
  return { gesture: { ...gesture, layout: next }, layout: next };
}

/** Moves a room by whole cells (arrow keys); undefined when the result is outside the grid or overlaps. */
export function moveBy(key: string, rooms: readonly LayoutRoom[], dx: number, dy: number, g: GridSize): RoomLayout | undefined {
  const r = rooms.find((x) => x.key === key);
  if (!r) return undefined;
  const next = { ...r.layout, x: r.layout.x + dx, y: r.layout.y + dy };
  return isFree(next, rooms, g, key) ? next : undefined;
}

/** Changes the size of a room by whole cells (Shift plus arrow keys); undefined when it would not fit. */
export function resizeBy(key: string, rooms: readonly LayoutRoom[], dw: number, dh: number, g: GridSize): RoomLayout | undefined {
  const r = rooms.find((x) => x.key === key);
  if (!r) return undefined;
  const next = { ...r.layout, w: r.layout.w + dw, h: r.layout.h + dh };
  return isFree(next, rooms, g, key) ? next : undefined;
}

/** Direction of an arrow key, or undefined for any other key. */
export function arrowDelta(key: string): { dx: number; dy: number } | undefined {
  switch (key) {
    case "ArrowLeft":
      return { dx: -1, dy: 0 };
    case "ArrowRight":
      return { dx: 1, dy: 0 };
    case "ArrowUp":
      return { dx: 0, dy: -1 };
    case "ArrowDown":
      return { dx: 0, dy: 1 };
    default:
      return undefined;
  }
}
