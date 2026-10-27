/** A node of the diagram: a column, an order within it (the order of the array) and a value. */
export interface SankeyNodeIn {
  id: string;
  col: number;
  value: number;
  /** the first tail node of a column leaves a larger gap above it (feed-in and charging sit below the rest) */
  tail?: boolean;
}

export interface SankeyLinkIn {
  id: string;
  from: string;
  to: string;
  value: number;
}

export interface SankeyInput {
  nodes: SankeyNodeIn[];
  links: SankeyLinkIn[];
  /** width of the whole drawing in px; the nodes of the last column end `reserve` px before it */
  width: number;
  /** height available for the tallest column (the tail of a column comes on top of it) */
  height: number;
  nodeWidth?: number;
  /** gap between two nodes of a column */
  gap?: number;
  /** gap above the first tail node */
  tailGap?: number;
  /** a node is never thinner than this */
  minHeight?: number;
  /** px kept free right of the last column (for its labels) */
  reserve?: number;
}

export interface SankeyNode extends SankeyNodeIn {
  x: number;
  y: number;
  h: number;
  /** the larger of its own value and what flows in or out */
  total: number;
}

export interface SankeyLink extends SankeyLinkIn {
  x0: number;
  x1: number;
  /** top edge of the band where it leaves the source and where it enters the target */
  y0: number;
  y1: number;
  /** thickness of the band */
  h: number;
}

export interface SankeyLayout {
  nodes: SankeyNode[];
  links: SankeyLink[];
  /** height of the drawing, from the top of the first to the bottom of the last node */
  height: number;
  columns: number;
  nodeWidth: number;
}

export const NODE_WIDTH = 10;
export const NODE_GAP = 8;
export const TAIL_GAP = 22;
export const MIN_NODE_HEIGHT = 2;

/**
 * Lays out a Sankey diagram: columns left to right, nodes stacked in the given order, all columns with
 * the same scale (px per unit) so that the bands keep their width from one column to the next. Columns are
 * centered vertically. A node as tall as the larger of its value and the sum of its bands; a band leaves
 * and enters a node in the order of the nodes it connects, so they cross as little as possible.
 *
 * Pure function: no DOM, no state.
 */
export function layoutSankey(i: SankeyInput): SankeyLayout {
  const nodeWidth = i.nodeWidth ?? NODE_WIDTH;
  const gap = i.gap ?? NODE_GAP;
  const tailGap = i.tailGap ?? TAIL_GAP;
  const minH = i.minHeight ?? MIN_NODE_HEIGHT;
  const cols = i.nodes.reduce((m, n) => Math.max(m, n.col + 1), 0);

  const ids = new Set(i.nodes.map((n) => n.id));
  const links = i.links.filter((l) => l.value > 0 && ids.has(l.from) && ids.has(l.to));
  const out = new Map<string, number>();
  const into = new Map<string, number>();
  for (const l of links) {
    out.set(l.from, (out.get(l.from) ?? 0) + l.value);
    into.set(l.to, (into.get(l.to) ?? 0) + l.value);
  }
  const total = (n: SankeyNodeIn) => Math.max(n.value, out.get(n.id) ?? 0, into.get(n.id) ?? 0);

  const byCol: SankeyNodeIn[][] = Array.from({ length: cols }, () => []);
  for (const n of i.nodes) byCol[n.col].push(n);
  const gaps = (col: SankeyNodeIn[]) =>
    col.reduce((s, n, k) => s + (k === 0 ? 0 : n.tail && !col.slice(0, k).some((m) => m.tail) ? tailGap : gap), 0);

  // one scale for all columns: the tightest one decides
  let scale = Infinity;
  for (const col of byCol) {
    const sum = col.reduce((s, n) => s + total(n), 0);
    if (sum > 0) scale = Math.min(scale, Math.max(0, i.height - gaps(col)) / sum);
  }
  if (!Number.isFinite(scale)) scale = 0;

  const height = (n: SankeyNodeIn) => Math.max(minH, total(n) * scale);
  const colHeight = (col: SankeyNodeIn[]) => col.reduce((s, n) => s + height(n), 0) + gaps(col);
  const drawingHeight = byCol.reduce((m, col) => Math.max(m, colHeight(col)), 0);

  const span = Math.max(0, i.width - (i.reserve ?? 0) - nodeWidth);
  const placed = new Map<string, SankeyNode>();
  byCol.forEach((col, c) => {
    let y = (drawingHeight - colHeight(col)) / 2;
    let tailSeen = false;
    col.forEach((n, k) => {
      if (k > 0) {
        const first = n.tail && !tailSeen;
        y += first ? tailGap : gap;
      }
      if (n.tail) tailSeen = true;
      const h = height(n);
      placed.set(n.id, { ...n, x: cols > 1 ? (c * span) / (cols - 1) : 0, y, h, total: total(n) });
      y += h;
    });
  });

  // bands: leave a node in the order of their targets, enter it in the order of their sources
  const center = (id: string) => {
    const n = placed.get(id)!;
    return n.y + n.h / 2;
  };
  const laid = new Map<string, SankeyLink>();
  for (const l of links) laid.set(l.id, { ...l, x0: 0, x1: 0, y0: 0, y1: 0, h: l.value * scale });
  const all = [...laid.values()];
  for (const n of placed.values()) {
    const leaving = all.filter((l) => l.from === n.id).sort((a, b) => center(a.to) - center(b.to));
    const entering = all.filter((l) => l.to === n.id).sort((a, b) => center(a.from) - center(b.from));
    // a node thicker than its bands (minimum height, a value without bands) keeps them at its top
    let yo = n.y;
    for (const l of leaving) {
      l.y0 = yo;
      yo += l.h;
    }
    let yi = n.y;
    for (const l of entering) {
      l.y1 = yi;
      yi += l.h;
    }
  }
  for (const l of all) {
    l.x0 = placed.get(l.from)!.x + nodeWidth;
    l.x1 = placed.get(l.to)!.x;
  }
  return { nodes: [...placed.values()], links: [...laid.values()], height: drawingHeight, columns: cols, nodeWidth };
}

/** The path of a band: the center line as a cubic curve, to be drawn with a stroke as wide as the band. */
export function bandPath(l: Pick<SankeyLink, "x0" | "x1" | "y0" | "y1" | "h">): string {
  const a = l.y0 + l.h / 2;
  const b = l.y1 + l.h / 2;
  const mid = (l.x0 + l.x1) / 2;
  return `M${l.x0},${a}C${mid},${a} ${mid},${b} ${l.x1},${b}`;
}
