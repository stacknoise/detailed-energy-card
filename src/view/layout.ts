export const SOURCE_H = 100;
export const HOME_H = 66;
/** Height of a floor pill including its border and glow. */
export const FLOOR_H = 48;
export const ROOM_H = 96;
/** Extra height of a source, floor or room that shows a second value (options.secondary_value). */
export const SECONDARY_H = 20;
export const ROOM_COL_W = 64;

/** The compact view (options.compact): circles of 40 instead of 54 px, so every row is lower. */
export const COMPACT = { sourceH: 84, homeH: 50, yHome: 100, floorGap: 76, floorH: 60, roomGap: 84, roomH: 84 } as const;
/** Wrapping into two rows is only offered for more rooms than this ... */
export const MAX_ROOMS_PER_ROW = 6;
/** ... and only when a single row would give each room less than this much width. */
export const ROOM_FIT_W = 80;

/** Estimated width of a floor pill with the value next to the name: padding, border and value (about 104 px), and 6.5 px per character of the name. */
const floorInlineW = (nameLength: number) => 104 + nameLength * 6.5;

/** The floors do not fit side by side with the value next to the name: the value then goes under the name. */
export function floorsStacked(width: number, names: string[]): boolean {
  if (names.length < 2) return false;
  return width / names.length < floorInlineW(Math.max(...names.map((n) => n.length)));
}

export interface LayoutInput {
  width: number;
  sources: number;
  floors: number;
  /** rooms in the currently visible row */
  rooms: number;
  /** wrap many rooms into two rows instead of scrolling */
  wrap?: boolean;
  /** the nodes show a second value: sources, floors and rooms get one line more */
  secondary?: boolean;
  /** a source shows the other direction (feed-in, charged) in a line of its own: the sources get one line more */
  returnLine?: boolean;
  /** the compact view: smaller circles and rows */
  compact?: boolean;
  /** the floors show the value under the name (see `floorsStacked`) */
  stackFloors?: boolean;
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
  /** width available to one room node: the distance between neighbours in a row (labels are cut to it) */
  roomColW: number;
  /** y position of each room (two rows when wrapped) */
  roomYs: number[];
  roomRows: number;
  /** height of the source nodes and of the floor pills: lines start at their bottom */
  sourceH: number;
  floorH: number;
  /** height of the home circle: lines to the floors and rooms start at its bottom */
  homeH: number;
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
  const wrapped = !!i.wrap && i.rooms > MAX_ROOMS_PER_ROW && i.rooms * ROOM_FIT_W > i.width;
  const perRow = wrapped ? wrapColumns(i.rooms) : i.rooms;
  const width = Math.max(i.width, perRow * ROOM_COL_W);
  const extra = i.secondary ? SECONDARY_H : 0;
  const back = i.returnLine ? SECONDARY_H : 0;
  const c = !!i.compact;
  const sourceH = (c ? COMPACT.sourceH : SOURCE_H) + extra + back;
  // a stacked pill has two lines, as in the compact view
  const stackExtra = !c && i.stackFloors ? COMPACT.floorH - FLOOR_H : 0;
  const floorH = (c ? COMPACT.floorH : FLOOR_H) + stackExtra + extra;
  const roomH = (c ? COMPACT.roomH : ROOM_H) + extra;
  const homeH = c ? COMPACT.homeH : HOME_H;
  const yHome = i.sources > 0 ? (c ? COMPACT.yHome : 124) + extra + back : 0;
  // Without a room row the floors sit closer to the home, and nothing is cut off below them.
  const yFloor = yHome + (c ? COMPACT.floorGap : i.floors > 0 && i.rooms === 0 ? 88 : 102);
  const yRoom = i.floors > 0 ? yFloor + 74 + stackExtra + extra : yHome + (c ? COMPACT.roomGap : 102);
  const rooms = roomPositions(i.rooms, width, wrapped);
  const roomRows = wrapped ? 2 : 1;
  const bottom = i.rooms > 0 ? yRoom + roomH * roomRows : i.floors > 0 ? yFloor + floorH : yHome + homeH;
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
    roomColW: perRow > 0 ? width / perRow : width,
    roomYs: rooms.row.map((r) => yRoom + r * roomH),
    roomRows,
    sourceH,
    floorH,
    homeH,
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

/** Slowest and fastest dash cycle in seconds, and the powers (W) where they are reached. */
export const SLOWEST_CYCLE = 3.2;
export const FASTEST_CYCLE = 0.35;
const SLOW_AT_W = 10;
const FAST_AT_W = 5000;

/**
 * Dash animation duration in seconds; null when there is no flow (< 1 W).
 * Logarithmic in the power, so the difference between 100 W and 1 kW is as visible as
 * between 1 kW and 10 kW: the more a node draws, the faster its lines move.
 */
export function flowDuration(watts: number): number | null {
  const abs = Math.abs(watts);
  if (abs < 1) return null;
  const t = (Math.log10(abs) - Math.log10(SLOW_AT_W)) / (Math.log10(FAST_AT_W) - Math.log10(SLOW_AT_W));
  const clamped = Math.min(1, Math.max(0, t));
  return SLOWEST_CYCLE - clamped * (SLOWEST_CYCLE - FASTEST_CYCLE);
}
