import { LitElement, css, svg, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { CELL, DEFAULT_COLS, DEFAULT_ROWS, type GridRoom, type HouseGridEventMap, type RoomLayout } from "../model/house";
import {
  arrowDelta,
  dragTo,
  moveBy,
  resizeBy,
  startGesture,
  type Gesture,
} from "../model/house-grid";
import { makeTr } from "../localize/editor";
import { defineOnce } from "../register";

/** Pixels per grid cell in the editor, as in the mock. */
export const GRID_CELL_PX = 40;
/** Padding around the grid in px (viewBox -6 -6 w+12 h+12). */
export const GRID_PAD = 6;
/** Radius of the resize handle at the bottom-right corner of the selected room. */
export const HANDLE_R = 8;
/** A room shows name and value when it is at least this many cells wide or high. */
export const LABEL_MIN_CELLS = 2;

/**
 * Floor-plan grid of the 3D editor (editor 2 of the mocks). Drawing, dragging and the handle work with mouse, pen and touch;
 * the keyboard moves (arrows), resizes (Shift plus arrows), selects (Tab, Enter, Space, Escape) and deletes (Delete).
 * All logic is in `model/house-grid.ts`; this component only turns pointer and key events into it and draws the result.
 * Properties: `rooms`, `cols`, `rows`, `selected` (key of the selected room), `language` (for the screen-reader texts).
 * Events (see HouseGridEventMap): `room-change`, `room-add`, `room-delete`, `room-select`.
 * An invalid position is dropped, the last valid one stays. The owner keeps the data: the grid only reports changes.
 */
export class DetailedEnergyHouseGrid extends LitElement {
  @property({ attribute: false }) rooms: GridRoom[] = [];
  @property({ type: Number }) cols = DEFAULT_COLS;
  @property({ type: Number }) rows = DEFAULT_ROWS;
  @property() selected?: string;
  @property() language?: string;
  /** Running drag; the rectangle drawn so far shows as dashed outline. */
  @state() private gesture?: Gesture;
  /** True while the grid focuses an element for a pointer press (the selection event is sent by the press itself). */
  private pointerFocus = false;

  static styles = css`
    :host {
      display: block;
      --_gl: var(--efc-line, var(--divider-color, #d5dbe4));
      --_room: var(--efc-room, color-mix(in srgb, var(--secondary-text-color, #566174) 20%, var(--card-background-color, #fff)));
      --_sel: var(--efc-room-selected, color-mix(in srgb, var(--primary-color, #488fc2) 25%, var(--card-background-color, #fff)));
      --_edge: var(--secondary-text-color, #566174);
      --_acc: var(--efc-grid-accent, var(--primary-color, #488fc2));
      --_text: var(--primary-text-color, #161c26);
      --_muted: var(--secondary-text-color, #566174);
    }
    svg:focus {
      outline: none;
    }
    svg {
      display: block;
      width: 100%;
      height: auto;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      cursor: crosshair;
      border-radius: 8px;
      background: var(--efc-grid-bg, var(--secondary-background-color, #f3f5f8));
    }
    .gl {
      stroke: var(--_gl);
      stroke-width: 1;
    }
    .rm {
      fill: var(--_room);
      stroke: var(--_edge);
      stroke-width: 1.5;
    }
    .rm.sel {
      fill: var(--_sel);
      stroke: var(--_acc);
      stroke-width: 3;
    }
    .rm.auto {
      stroke-dasharray: 6 4;
    }
    .rm.tmp {
      fill: none;
      stroke: var(--_acc);
      stroke-width: 2;
      stroke-dasharray: 6 4;
    }
    g.room {
      cursor: grab;
    }
    g.room:focus {
      outline: none;
    }
    .rt {
      font: 600 13px var(--paper-font-body1_-_font-family, system-ui, sans-serif);
      fill: var(--_text);
      pointer-events: none;
    }
    .rk {
      font: 500 11px var(--paper-font-body1_-_font-family, system-ui, sans-serif);
      fill: var(--_muted);
      pointer-events: none;
    }
    .hd {
      fill: var(--_acc);
      stroke: var(--card-background-color, #fff);
      stroke-width: 2;
      cursor: nwse-resize;
    }
  `;

  /** Fires one of the grid events. */
  protected emit<K extends keyof HouseGridEventMap>(name: K, detail: HouseGridEventMap[K]): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  /** The rooms as the logic sees them: during a drag the dragged room already has its new layout. */
  private effectiveRooms(): GridRoom[] {
    const g = this.gesture;
    if (!g || g.mode === "new") return this.rooms;
    return this.rooms.map((r) => (r.key === g.key ? { ...r, layout: g.layout } : r));
  }

  private get size() {
    return { cols: this.cols, rows: this.rows };
  }

  /** Pointer position in grid cells (floats). The viewBox keeps the aspect ratio, so one scale is enough. */
  private cellPoint(e: PointerEvent): [number, number] {
    const el = this.renderRoot.querySelector("svg") as SVGSVGElement;
    const b = el.getBoundingClientRect();
    const vw = this.cols * GRID_CELL_PX + 2 * GRID_PAD;
    const vh = this.rows * GRID_CELL_PX + 2 * GRID_PAD;
    return [
      (((e.clientX - b.left) / (b.width || 1)) * vw - GRID_PAD) / GRID_CELL_PX,
      (((e.clientY - b.top) / (b.height || 1)) * vh - GRID_PAD) / GRID_CELL_PX,
    ];
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== undefined && e.button > 0) return;
    const [px, py] = this.cellPoint(e);
    const { gesture, room } = startGesture(this.rooms, this.selected, px, py, this.size);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    this.gesture = gesture;
    if (gesture.mode !== "size" && room !== this.selected) this.emit("room-select", { key: room });
    // preventDefault keeps the page from scrolling or selecting text, so focus is set by hand: the keys then work after a click
    e.preventDefault();
    this.pointerFocus = true;
    const target = room === undefined ? undefined : this.renderRoot.querySelector<SVGElement>(`g.room[data-key="${CSS.escape(room)}"]`);
    (target ?? this.renderRoot.querySelector<SVGElement>("svg"))?.focus({ preventScroll: true });
    this.pointerFocus = false;
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.gesture) return;
    const [px, py] = this.cellPoint(e);
    const prev = this.gesture;
    const { gesture, layout } = dragTo(prev, this.effectiveRooms(), px, py, this.size);
    this.gesture = gesture;
    if (layout && prev.mode !== "new" && !sameLayout(layout, prev.layout)) this.emit("room-change", { key: prev.key, layout });
  };

  private onPointerEnd = (): void => {
    const g = this.gesture;
    if (!g) return;
    this.gesture = undefined;
    if (g.mode === "new" && g.tmp) this.emit("room-add", { layout: g.tmp });
  };

  private selectByKey(key: string): void {
    if (key !== this.selected) this.emit("room-select", { key });
  }

  /** Keyboard: Tab moves through the rooms and selects the focused one (Enter or Space too); arrows move, Shift plus arrows resize, Delete removes, Escape clears. */
  private onKeyDown = (e: KeyboardEvent): void => {
    const sel = this.selected;
    const focused = (e.target as Element | null)?.closest?.("[data-key]")?.getAttribute("data-key") ?? undefined;
    if (e.key === "Enter" || e.key === " ") {
      if (focused === undefined) return;
      this.selectByKey(focused);
      e.preventDefault();
      return;
    }
    if (e.key === "Escape") {
      if (sel !== undefined) this.emit("room-select", { key: undefined });
      return;
    }
    if (sel === undefined) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      this.emit("room-delete", { key: sel });
      e.preventDefault();
      return;
    }
    const d = arrowDelta(e.key);
    if (!d) return;
    e.preventDefault();
    const layout = e.shiftKey ? resizeBy(sel, this.rooms, d.dx, d.dy, this.size) : moveBy(sel, this.rooms, d.dx, d.dy, this.size);
    if (layout) this.emit("room-change", { key: sel, layout });
  };

  /** Focusing a room (Tab) selects it, so the arrow keys act on it. */
  private onFocusIn = (e: FocusEvent): void => {
    if (this.pointerFocus) return;
    const key = (e.target as Element | null)?.closest?.("[data-key]")?.getAttribute("data-key");
    if (key) this.selectByKey(key);
  };

  private roomShape(r: GridRoom, tr: ReturnType<typeof makeTr>): TemplateResult {
    const l = r.layout;
    const sel = r.key === this.selected;
    const label = [r.name, r.value].filter(Boolean).join(", ");
    // the text is cut at the edge of its room (a narrow room would let it run over the neighbour); the title shows it in full on hover
    const clip = `rc-${r.key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    return svg`<g class="room" data-key=${r.key} tabindex="0" role="button" aria-pressed=${sel ? "true" : "false"}
        aria-label=${`${label} (${tr("house_ed_grid_room_pos", l.x + 1, l.y + 1, l.w, l.h)})`}>
      <title>${label}</title>
      <clipPath id=${clip}><rect x=${l.x * GRID_CELL_PX + 4} y=${l.y * GRID_CELL_PX + 1} width=${Math.max(0, l.w * GRID_CELL_PX - 8)} height=${l.h * GRID_CELL_PX - 2}></rect></clipPath>
      <rect class="rm ${sel ? "sel" : ""} ${r.auto ? "auto" : ""}" x=${l.x * GRID_CELL_PX + 1} y=${l.y * GRID_CELL_PX + 1} width=${l.w * GRID_CELL_PX - 2} height=${l.h * GRID_CELL_PX - 2} rx="4"></rect>
      ${l.w >= LABEL_MIN_CELLS || l.h >= LABEL_MIN_CELLS
        ? svg`<g clip-path="url(#${clip})"><text class="rt" x=${l.x * GRID_CELL_PX + 8} y=${l.y * GRID_CELL_PX + 20}>${r.name}</text>
          ${r.value ? svg`<text class="rk" x=${l.x * GRID_CELL_PX + 8} y=${l.y * GRID_CELL_PX + 35}>${r.value}</text>` : ""}</g>`
        : ""}
    </g>`;
  }

  protected render(): TemplateResult {
    const tr = makeTr(this.language);
    const w = this.cols * GRID_CELL_PX;
    const h = this.rows * GRID_CELL_PX;
    const rooms = this.effectiveRooms();
    const sel = rooms.find((r) => r.key === this.selected);
    const tmp: RoomLayout | undefined = this.gesture?.mode === "new" ? this.gesture.tmp : undefined;
    const lines: TemplateResult[] = [];
    for (let i = 0; i <= this.cols; i++) lines.push(svg`<line class="gl" x1=${i * GRID_CELL_PX} y1="0" x2=${i * GRID_CELL_PX} y2=${h}></line>`);
    for (let j = 0; j <= this.rows; j++) lines.push(svg`<line class="gl" x1="0" y1=${j * GRID_CELL_PX} x2=${w} y2=${j * GRID_CELL_PX}></line>`);
    return svg`<svg viewBox="${-GRID_PAD} ${-GRID_PAD} ${w + 2 * GRID_PAD} ${h + 2 * GRID_PAD}" data-cell=${CELL}
        tabindex="-1" role="group" aria-label=${tr("house_ed_grid_label")} aria-describedby="hint"
        @pointerdown=${this.onPointerDown} @pointermove=${this.onPointerMove} @pointerup=${this.onPointerEnd}
        @pointercancel=${this.onPointerEnd} @keydown=${this.onKeyDown} @focusin=${this.onFocusIn}>
      <desc id="hint">${tr("house_ed_grid_hint")}</desc>
      ${lines}
      ${repeat(rooms, (r) => r.key, (r) => this.roomShape(r, tr))}
      ${tmp ? svg`<rect class="rm tmp" x=${tmp.x * GRID_CELL_PX + 1} y=${tmp.y * GRID_CELL_PX + 1} width=${tmp.w * GRID_CELL_PX - 2} height=${tmp.h * GRID_CELL_PX - 2} rx="4"></rect>` : ""}
      ${sel ? svg`<circle class="hd" cx=${(sel.layout.x + sel.layout.w) * GRID_CELL_PX - 2} cy=${(sel.layout.y + sel.layout.h) * GRID_CELL_PX - 2} r=${HANDLE_R}></circle>` : ""}
    </svg>`;
  }
}

/** True when two layouts are equal. */
function sameLayout(a: RoomLayout, b: RoomLayout): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

defineOnce("detailed-energy-house-grid", DetailedEnergyHouseGrid);
