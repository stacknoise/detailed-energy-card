export const SOURCE_H = 100;
export const HOME_H = 66;
export const FLOOR_H = 40;
export const ROOM_H = 96;
export const ROOM_COL_W = 64;
/** More rooms than this in one row scroll horizontally, or wrap into two rows if enabled. */
export const MAX_ROOMS_PER_ROW = 6;

export interface LayoutInput {
  width: number;
  sources: number;
  floors: number;
  /** rooms in the currently visible row */
  rooms: number;
  /** wrap many rooms into two rows instead of scrolling */
  wrap?: boolean;
}

export interface Layout {
  width: number;
  height: number;
  homeX: number;
  yHome: number;
  yFloor: number;
  yRoom: number;
  sourceXs: number[];
  floorXs: number[];
  roomXs: number[];
  /** y position of each room (two rows when wrapped) */
  roomYs: number[];
  roomRows: number;
}

/** Evenly distributes n nodes over width: x = W * (i + 0.5) / n. */
export function distribute(n: number, width: number): number[] {
  return Array.from({ length: n }, (_, i) => (width * (i + 0.5)) / n);
}

/**
 * Room positions. A wrapped layout uses two rows. The second row sits in the gaps between
 * the nodes of the first row so its lines run between them: cols = floor(n / 2) + 1 leaves
 * cols - 1 gaps, which fits odd n exactly and even n with the last gap left empty.
 */
/** Nodes in the first row of a wrapped layout. */
export const wrapColumns = (n: number): number => Math.floor(n / 2) + 1;

export function roomPositions(n: number, width: number, wrap: boolean): { xs: number[]; row: number[] } {
  if (!wrap || n <= MAX_ROOMS_PER_ROW) return { xs: distribute(n, width), row: Array(n).fill(0) };
  const cols = wrapColumns(n);
  const rest = n - cols;
  const first = distribute(cols, width);
  const second = Array.from({ length: rest }, (_, c) => (width * (c + 1)) / cols);
  return { xs: [...first, ...second], row: [...Array(cols).fill(0), ...Array(rest).fill(1)] };
}

export function computeLayout(i: LayoutInput): Layout {
  // Rows keep a fixed minimum column width; too many rooms scroll horizontally.
  const wrapped = !!i.wrap && i.rooms > MAX_ROOMS_PER_ROW;
  const perRow = wrapped ? wrapColumns(i.rooms) : i.rooms;
  const width = Math.max(i.width, perRow * ROOM_COL_W);
  const yHome = i.sources > 0 ? 124 : 0;
  const yFloor = yHome + 102;
  const yRoom = i.floors > 0 ? yFloor + 74 : yHome + 102;
  const rooms = roomPositions(i.rooms, width, wrapped);
  const roomRows = wrapped ? 2 : 1;
  const bottom = i.rooms > 0 ? yRoom + ROOM_H * roomRows : i.floors > 0 ? yFloor + FLOOR_H : yHome + HOME_H;
  return {
    width,
    height: bottom,
    homeX: width / 2,
    yHome,
    yFloor,
    yRoom,
    sourceXs: distribute(i.sources, width),
    floorXs: distribute(i.floors, width),
    roomXs: rooms.xs,
    roomYs: rooms.row.map((r) => yRoom + r * ROOM_H),
    roomRows,
  };
}

/** Cubic Bezier from (x0,y0) to (x1,y1) with vertical tangents. */
export function curve(x0: number, y0: number, x1: number, y1: number): string {
  const m = (y0 + y1) / 2;
  return `M ${x0} ${y0} C ${x0} ${m} ${x1} ${m} ${x1} ${y1}`;
}

/**
 * Line from a parent to a room. Rooms of the second row get a line that first curves to
 * just above the first row and then drops straight down through the gap between its nodes.
 */
export function roomPath(x0: number, y0: number, x1: number, y1: number, firstRowY: number): string {
  if (y1 <= firstRowY) return curve(x0, y0, x1, y1);
  const yTop = firstRowY - 6;
  return `${curve(x0, y0, x1, yTop)} L ${x1} ${y1}`;
}

/** Stroke width in px for a power in watts. */
export const strokeWidth = (watts: number): number => 1 + (Math.abs(watts) / 1000) * 0.7;

/** Dash animation duration in seconds; null when there is no flow (< 1 W). */
export function flowDuration(watts: number): number | null {
  const abs = Math.abs(watts);
  if (abs < 1) return null;
  return Math.min(2.2, Math.max(0.5, 2.2 - (abs / 1000) * 0.5));
}
