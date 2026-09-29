export const SOURCE_H = 100;
export const HOME_H = 66;
export const FLOOR_H = 40;
export const ROOM_H = 96;
export const ROOM_COL_W = 64;

export interface LayoutInput {
  width: number;
  sources: number;
  floors: number;
  /** rooms in the currently visible row */
  rooms: number;
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
}

/** Evenly distributes n nodes over width: x = W * (i + 0.5) / n. */
export function distribute(n: number, width: number): number[] {
  return Array.from({ length: n }, (_, i) => (width * (i + 0.5)) / n);
}

export function computeLayout(i: LayoutInput): Layout {
  // Rows with many rooms keep a fixed column width and scroll horizontally.
  const width = Math.max(i.width, i.rooms * ROOM_COL_W);
  const yHome = i.sources > 0 ? 124 : 0;
  const yFloor = yHome + 102;
  const yRoom = i.floors > 0 ? yFloor + 74 : yHome + 102;
  const bottom = i.rooms > 0 ? yRoom + ROOM_H : i.floors > 0 ? yFloor + FLOOR_H : yHome + HOME_H;
  return {
    width,
    height: bottom,
    homeX: width / 2,
    yHome,
    yFloor,
    yRoom,
    sourceXs: distribute(i.sources, width),
    floorXs: distribute(i.floors, width),
    roomXs: distribute(i.rooms, width),
  };
}

/** Cubic Bezier from (x0,y0) to (x1,y1) with vertical tangents. */
export function curve(x0: number, y0: number, x1: number, y1: number): string {
  const m = (y0 + y1) / 2;
  return `M ${x0} ${y0} C ${x0} ${m} ${x1} ${m} ${x1} ${y1}`;
}

/** Stroke width in px for a power in watts. */
export const strokeWidth = (watts: number): number => 1 + (Math.abs(watts) / 1000) * 0.7;

/** Dash animation duration in seconds; null when there is no flow (< 1 W). */
export function flowDuration(watts: number): number | null {
  const abs = Math.abs(watts);
  if (abs < 1) return null;
  return Math.min(2.2, Math.max(0.5, 2.2 - (abs / 1000) * 0.5));
}
