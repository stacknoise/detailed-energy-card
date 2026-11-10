import { LitElement, css, svg, type TemplateResult } from "lit";
import { property } from "lit/decorators.js";
import { CELL, DEFAULT_COLS, DEFAULT_ROWS, type GridRoom, type HouseGridEventMap } from "../model/house";
import { defineOnce } from "../register";

/** Pixels per grid cell in the editor, as in the mock. */
export const GRID_CELL_PX = 40;
/** Padding around the grid in px (viewBox -6 -6 w+12 h+12). */
export const GRID_PAD = 6;

/**
 * Floor-plan grid of the 3D editor (contract of AP0; AP5 builds the pointer, touch and key handling).
 * Properties: `rooms`, `cols`, `rows`, `selected` (key of the selected room).
 * Events (see HouseGridEventMap): `room-change`, `room-add`, `room-delete`, `room-select`.
 * For now it only draws the grid and the rooms.
 */
export class DetailedEnergyHouseGrid extends LitElement {
  @property({ attribute: false }) rooms: GridRoom[] = [];
  @property({ type: Number }) cols = DEFAULT_COLS;
  @property({ type: Number }) rows = DEFAULT_ROWS;
  @property() selected?: string;

  static styles = css`
    :host {
      display: block;
    }
    svg {
      display: block;
      width: 100%;
    }
  `;

  /** Fires one of the grid events. */
  protected emit<K extends keyof HouseGridEventMap>(name: K, detail: HouseGridEventMap[K]): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  protected render(): TemplateResult {
    const w = this.cols * GRID_CELL_PX;
    const h = this.rows * GRID_CELL_PX;
    return svg`<svg viewBox="${-GRID_PAD} ${-GRID_PAD} ${w + 2 * GRID_PAD} ${h + 2 * GRID_PAD}" data-cell=${CELL}>
      <rect width=${w} height=${h} fill="none" stroke="currentColor" stroke-opacity="0.3"></rect>
      ${this.rooms.map(
        (r) => svg`<rect x=${r.layout.x * GRID_CELL_PX} y=${r.layout.y * GRID_CELL_PX} width=${r.layout.w * GRID_CELL_PX} height=${r.layout.h * GRID_CELL_PX} rx="4" fill="currentColor" fill-opacity=${r.key === this.selected ? 0.3 : 0.15}></rect>`,
      )}
    </svg>`;
  }
}

defineOnce("detailed-energy-house-grid", DetailedEnergyHouseGrid);
