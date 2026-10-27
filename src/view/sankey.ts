import { html, nothing, svg, type TemplateResult } from "lit";
import type { SankeyGraph, SankeyGraphNode } from "../model/sankey";
import { ease } from "./focus";
import { bandPath, layoutSankey, type SankeyLayout } from "./sankey-layout";
import { stackColor } from "./timeline";

/** What the diagram needs for one frame; built by the card. */
export interface SankeyContext {
  width: number;
  graph: SankeyGraph;
  /** ids of the nodes that are selected (the floor, the room) */
  selected: ReadonlySet<string>;
  fmt: (value: number) => string;
  /** nodes that take their share from the sources in proportion say so in their tooltip */
  splitNote: string;
  /** shown instead of the diagram while there is nothing to draw */
  empty?: string;
  /** a click on a node (a source or a consumer opens its more-info dialog, a floor or a room is selected) */
  click: (n: SankeyGraphNode) => void;
  /** whether a click on the node does anything */
  clickable: (n: SankeyGraphNode) => boolean;
  /** the bands slide to their new places (the power mode; off with `options.animation: false`) */
  animate: boolean;
}

/** Height of the tallest column in px, depending on how many nodes the busiest column has. */
export function columnHeight(graph: SankeyGraph): number {
  const count = new Map<number, number>();
  for (const n of graph.nodes) count.set(n.col, (count.get(n.col) ?? 0) + 1);
  const most = Math.max(1, ...count.values());
  return Math.min(340, Math.max(180, most * 30));
}

/** Nodes smaller than this share of the height get no label, only a tooltip. */
export const LABEL_MIN_SHARE = 0.03;
/** px kept free right of the last column for its labels */
export const LABEL_RESERVE = 96;
const SLIDE_MS = 420;
const LINE = 12;

/** Cuts a label to about `px` pixels with an ellipsis. */
export function fit(text: string, px: number): string {
  const max = Math.floor(px / 5.6);
  if (max < 2) return "";
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

type Geometry = number[];

/** Geometry of the nodes ([y, h, opacity]) and bands ([y0, y1, h, opacity]) by id, for the slide. */
function geometry(l: SankeyLayout): Map<string, Geometry> {
  const out = new Map<string, Geometry>();
  for (const n of l.nodes) out.set(`n:${n.id}`, [n.y, n.h, 1]);
  for (const b of l.links) out.set(`l:${b.id}`, [b.y0, b.y1, b.h, 1]);
  return out;
}

/**
 * The Sankey diagram. `prepare()` runs before every render and works out the layout and, while the bands slide
 * to their new places, the frame in between; `render()` only reads.
 */
export class SankeyView {
  private _layout?: SankeyLayout;
  private _ctx?: SankeyContext;
  /** geometry on screen now */
  private _frame = new Map<string, Geometry>();
  private _from = new Map<string, Geometry>();
  private _to = new Map<string, Geometry>();
  private _start = 0;
  private _sliding = false;
  private _raf = 0;

  constructor(private readonly requestUpdate: () => void) {}

  reset(): void {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    this._sliding = false;
    this._layout = undefined;
    this._ctx = undefined;
    this._frame = new Map();
    this._to = new Map();
  }

  get ready(): boolean {
    return !!this._layout;
  }

  prepare(c: SankeyContext): void {
    this._ctx = c;
    if (!c.graph.nodes.length) {
      this.reset();
      this._ctx = c;
      return;
    }
    const layout = layoutSankey({
      nodes: c.graph.nodes,
      links: c.graph.links,
      width: Math.max(260, c.width),
      height: columnHeight(c.graph),
      reserve: LABEL_RESERVE,
    });
    this._layout = layout;
    const to = geometry(layout);
    const now = performance.now();
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const changed = !sameGeometry(to, this._to);
    if (changed) {
      this._to = to;
      // slide from what is on screen now; what is new fades in where it belongs
      this._from = new Map();
      for (const [id, g] of to) {
        const was = this._frame.get(id);
        this._from.set(id, was ?? [...g.slice(0, -1), 0]);
      }
      this._start = now;
      this._sliding = c.animate && !reduced && this._frame.size > 0;
    }
    if (this._sliding && now - this._start < SLIDE_MS) {
      const t = ease((now - this._start) / SLIDE_MS);
      const frame = new Map<string, Geometry>();
      for (const [id, g] of to) {
        const a = this._from.get(id)!;
        frame.set(id, g.map((v, k) => a[k] + (v - a[k]) * t));
      }
      this._frame = frame;
      if (!this._raf) {
        this._raf = requestAnimationFrame(() => {
          this._raf = 0;
          this.requestUpdate();
        });
      }
    } else {
      this._sliding = false;
      this._frame = to;
    }
  }

  render(): TemplateResult {
    const c = this._ctx;
    const l = this._layout;
    if (!c || !l) return html`<div class="sankey-empty">${c?.empty ?? ""}</div>`;
    const W = Math.max(260, c.width);
    const H = l.height + 8;
    const g = (key: string): Geometry | undefined => this._frame.get(key);
    const byId = new Map(c.graph.nodes.map((n) => [n.id, n]));
    // colorless nodes take shades of the accent color, by their place in the column
    const seen = new Map<number, number>();
    const color = new Map<string, string>();
    for (const n of c.graph.nodes) {
      const k = seen.get(n.col) ?? 0;
      seen.set(n.col, k + 1);
      color.set(n.id, n.color && n.color !== "theme" ? n.color : stackColor(k));
    }
    const span = l.columns > 1 ? (W - LABEL_RESERVE - l.nodeWidth) / (l.columns - 1) : 0;

    const bands = l.links.map((b) => {
      const geo = g(`l:${b.id}`) ?? [b.y0, b.y1, b.h, 1];
      const from = byId.get(b.from)!;
      const to = byId.get(b.to)!;
      const [y0, y1, h, o] = geo;
      return svg`<path class="sk-band" d=${bandPath({ ...b, y0, y1, h })} stroke-width=${Math.max(0.5, h)} style=${`stroke:${color.get(b.from)};opacity:${0.38 * o}`}>
        <title>${from.name} → ${to.name}: ${c.fmt(b.value)}</title>
      </path>`;
    });

    const nodes = l.nodes.map((n) => {
      const data = byId.get(n.id)!;
      const geo = g(`n:${n.id}`) ?? [n.y, n.h, 1];
      const [y, h, o] = geo;
      const on = c.clickable(data);
      const sel = c.selected.has(n.id);
      const act = () => c.click(data);
      const title = `${data.name}: ${c.fmt(data.value)}${data.split ? `\n${c.splitNote}` : ""}`;
      return svg`<rect class=${`sk-node${sel ? " sk-sel" : ""}${on ? " sk-pick" : ""}`} x=${n.x} y=${y} width=${l.nodeWidth} height=${h} rx="2"
        style=${`fill:${color.get(n.id)};opacity:${o}`} tabindex=${on ? 0 : nothing} role=${on ? "button" : nothing}
        aria-label=${on ? title : nothing} @click=${on ? act : nothing}
        @keydown=${on ? (e: KeyboardEvent) => (e.key === "Enter" || e.key === " " ? (e.preventDefault(), act()) : undefined) : nothing}>
        <title>${title}</title>
      </rect>`;
    });

    const labels = l.nodes.map((n) => {
      const data = byId.get(n.id)!;
      const [y, h, o] = g(`n:${n.id}`) ?? [n.y, n.h, 1];
      if (h < l.height * LABEL_MIN_SHARE || o < 0.5) return nothing;
      const room = (n.col === l.columns - 1 ? LABEL_RESERVE : span) - l.nodeWidth - 8;
      const x = n.x + l.nodeWidth + 5;
      const two = h >= 2 * LINE + 2;
      const name = fit(data.name, room);
      const value = c.fmt(data.value);
      if (!name) return nothing;
      const mid = y + h / 2;
      if (two) return svg`<text class="sk-label" x=${x} y=${mid - 2}>${name}</text><text class="sk-label sk-value" x=${x} y=${mid + LINE - 2}>${value}</text>`;
      // one line: name and value when both fit, else the name alone (the value is in the tooltip)
      const both = `${data.name} ${value}`;
      return svg`<text class="sk-label" x=${x} y=${mid + 4}>${fit(both, room) === both ? both : name}</text>`;
    });

    return html`
      <div class="scroll sankey">
        <svg class="chart sankey-chart" width=${W} height=${H} viewBox="0 0 ${W} ${H}" role="group">
          <g>${bands}</g>
          <g>${nodes}</g>
          <g>${labels}</g>
        </svg>
      </div>
    `;
  }
}

function sameGeometry(a: Map<string, Geometry>, b: Map<string, Geometry>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, g] of a) {
    const o = b.get(id);
    if (!o || o.some((v, k) => Math.abs(v - g[k]) > 0.01)) return false;
  }
  return true;
}
