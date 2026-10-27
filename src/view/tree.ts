import { html, nothing, svg, type TemplateResult } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import type { EnergyCardConfig } from "../model/config";
import { nodeKey, type EnergyModel, type MeterInfo, type RoomNode, type SourceNode } from "../model/compute";
import type { Selection } from "../model/selection";
import { elementThresholds, isIdle, thresholdColor, thresholdLevel, thresholdWidth, type ThresholdConfig, type ThresholdLevel } from "../model/thresholds";
import type { Key } from "../localize";
import { Tween, focusTargets, type Pos } from "./focus";
import { computeLayout, curve, roomPath, flowDuration, strokeWidth, HOME_H, type Layout } from "./layout";

/** More ranges than this do not get any thicker. */
export const MAX_LEVEL = 3;
/** Room columns narrower than this get a smaller label font, so that more of the name stays readable. */
const TIGHT_COL_W = 90;

/** A room with where it is shown; rooms of a floor that was just left are still drawn while they fade out. */
interface RoomView {
  room: RoomNode;
  p: Pos;
  leaving: boolean;
}

/** Inline opacity of a node that is fading; undefined leaves it to the stylesheet (idle nodes are dimmed there). */
const fade = (o: number, idle: boolean): string | undefined => (o >= 1 ? undefined : String(o * (idle ? 0.45 : 1)));

const SOURCE_ICONS: Record<string, string> = {
  solar: "mdi:white-balance-sunny",
  battery: "mdi:battery-high",
  grid: "mdi:transmission-tower",
  generic: "mdi:flash",
};

/** Small mark on a room or a floor with its own meter: a meter icon, or a warning when the meter cannot be read or measures less than the children. */
function meterMark(c: TreeContext, m: MeterInfo | undefined, children: "consumers" | "rooms"): TemplateResult | typeof nothing {
  if (!m) return nothing;
  if (m.invalid) return html`<ha-icon class="meter warn" icon=${"mdi:alert-outline"} title=${c.t("meter_invalid")}></ha-icon>`;
  if (m.excess !== undefined) {
    const text = c.t(children === "rooms" ? "excess_rooms" : "excess_consumers").replace("{0}", c.fmt(m.excess));
    return html`<ha-icon class="meter warn" icon=${"mdi:alert-outline"} title=${text}></ha-icon>`;
  }
  return html`<ha-icon class="meter" icon=${"mdi:meter-electric-outline"} title=${c.t("meter")}></ha-icon>`;
}

/** The second line under a node, or nothing (a node without a second value keeps the line empty). */
function secondLine(c: TreeContext, key: string): TemplateResult | typeof nothing {
  if (!c.secondary) return nothing;
  return html`<span class="second" title=${c.secondTitle?.(key) ?? nothing}>${c.second(key) ?? ""}</span>`;
}

/** The selection applied to the model: the selected floor (index), the room row it shows and the selected room in it. */
export interface ResolvedSelection {
  floor?: number;
  rooms: RoomNode[];
  room?: number;
}

/** What the tree view needs from the card for one frame. */
export interface TreeContext {
  config: EnergyCardConfig;
  model: EnergyModel;
  sel: ResolvedSelection;
  /** the selection as stored (ids), the base of a room click */
  stored: Selection;
  width: number;
  energy: boolean;
  focus: boolean;
  thresholds: Record<ThresholdLevel, ThresholdConfig[]>;
  home: string;
  fmt(watts: number): string;
  /** the nodes show a second value (options.secondary_value): one line more */
  secondary: boolean;
  /** the second line of a node by nodeKey, undefined when it has none */
  second(key: string): string | undefined;
  /** tooltip of the second line (costs: energy, the part from the grid, the amount) */
  secondTitle?(key: string): string | undefined;
  t(key: Key): string;
  select(sel: Selection): void;
  moreInfo(entityId: string): void;
}

/**
 * The tree diagram: sources, home, floors and rooms joined by lines. Keeps what the slide of
 * `options.focus_selected` needs between frames; `prepare()` runs before every render, `render()` only reads.
 */
export class TreeView {
  /** slide after a selection change (only with options.focus_selected) */
  private _tween?: Tween;
  private _raf = 0;
  private _lastSelKey?: string;
  /** positions drawn by the current render, computed in `prepare` */
  private _frame?: { floorViews: Pos[]; roomViews: RoomView[] };
  /** what the previous render showed, the start of the next slide */
  private _lastShown = new Map<string, Pos>();
  private _lastRooms = new Map<string, RoomNode>();

  /** @param _requestUpdate asks the card for the next frame of a slide */
  constructor(private readonly _requestUpdate: () => void) {}

  /** The card was detached: the slide ends. */
  stop(): void {
    cancelAnimationFrame(this._raf);
    this._tween = undefined;
  }

  /** Nothing to draw (error, no config or no model yet). */
  reset(): void {
    this._frame = undefined;
  }

  get ready(): boolean {
    return !!this._frame;
  }

  private _startTween(next: Map<string, Pos>, origin: Pos): void {
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tween = new Tween(this._lastShown, next, () => origin, reduced, performance.now());
    this._tween = tween;
    cancelAnimationFrame(this._raf);
    const step = () => {
      this._requestUpdate();
      if (this._tween === tween && !tween.finished(performance.now())) this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }

  /** What the selection and the width of the card make of the diagram: pure, nothing is stored. */
  private _geometry(c: TreeContext) {
    const { model, sel } = c;
    const layout = computeLayout({
      width: c.width || 320,
      sources: model.sources.length,
      floors: model.floors.length,
      rooms: sel.rooms.length,
      wrap: c.config.options?.wrap_rooms === true,
      secondary: c.secondary,
      returnLine: c.energy && model.sources.some((s) => s.returnCounter),
    });
    // Positions of the floors and rooms. With options.focus_selected the selected element of a level
    // slides to the middle under its parent and the rest of that level fades out behind it.
    const tg = focusTargets({
      layout,
      floors: model.floors.length,
      selFloor: sel.floor,
      rooms: sel.rooms.length,
      selRoom: sel.room,
      focus: c.focus,
    });
    const targets = new Map<string, Pos>();
    model.floors.forEach((f, i) => targets.set(`f:${f.id}`, tg.floors[i]));
    sel.rooms.forEach((r, i) => targets.set(`r:${r.id}`, tg.rooms[i]));
    const selKey = `${sel.floor ?? ""}|${sel.room ?? ""}`;
    return { layout, tg, targets, selKey };
  }

  /**
   * Where the floors and rooms are drawn now. Runs before every render (and not in `render()`, which only
   * reads the result): a changed selection starts the slide from what the previous frame showed.
   */
  prepare(c: TreeContext): void {
    const { model, sel } = c;
    const { layout, tg, targets, selKey } = this._geometry(c);
    if (c.focus && this._lastSelKey !== undefined && selKey !== this._lastSelKey) {
      const parent = sel.floor !== undefined ? tg.floors[sel.floor] : { x: layout.homeX, y: layout.yHome, o: 1 };
      this._startTween(targets, { x: parent.x, y: parent.y + layout.floorH / 2, o: 0 });
    }
    this._lastSelKey = selKey;
    const now = performance.now();
    if (this._tween?.finished(now)) this._tween = undefined;
    const pos = (id: string): Pos => this._tween?.sample(id, now) ?? targets.get(id) ?? { x: 0, y: 0, o: 0 };
    const floorViews = model.floors.map((f) => pos(`f:${f.id}`));
    sel.rooms.forEach((r) => this._lastRooms.set(r.id, r));
    const roomViews: RoomView[] = sel.rooms.map((r) => ({ room: r, p: pos(`r:${r.id}`), leaving: false }));
    // rooms of a floor that was just left fade out where they were
    for (const id of this._tween?.leaving ?? []) {
      const gone = id.startsWith("r:") ? this._lastRooms.get(id.slice(2)) : undefined;
      if (gone) roomViews.push({ room: gone, p: pos(id), leaving: true });
    }
    this._lastShown = new Map([
      ...model.floors.map((f, i) => [`f:${f.id}`, floorViews[i]] as const),
      ...roomViews.map((v) => [`r:${v.room.id}`, v.p] as const),
    ]);
    this._frame = { floorViews, roomViews };
  }

  render(c: TreeContext): TemplateResult | typeof nothing {
    const frame = this._frame;
    if (!frame) return nothing;
    const { model, sel } = c;
    const { layout } = this._geometry(c);
    const allFloors = model.floors.length > 0 && sel.floor === undefined;
    // No single room selected: all rooms of the visible row count as selected.
    const allRooms = sel.rooms.length > 0 && sel.room === undefined;
    const { floorViews, roomViews } = frame;
    return html`
      <div class="scroll">
        <div class="graph" style=${styleMap({ width: `${layout.width}px`, height: `${layout.height}px` })}>
          ${this._renderLines(c, layout, floorViews, roomViews, allRooms, allFloors)}
          ${model.sources.map((s, i) => this._renderSource(c, s, layout.sourceXs[i]))}
          ${this._renderHome(c, layout, allFloors || (!model.floors.length && allRooms))}
          ${model.floors.map((f, i) => this._renderFloor(c, f.id, f.name, f.watts, f.color, floorViews[i], i === sel.floor, allFloors, f.meter))}
          ${roomViews.map((v) => this._renderRoom(c, v.room, v.p, layout.roomColW, !v.leaving && v.room.id === sel.rooms[sel.room ?? -1]?.id, allRooms, v.leaving))}
        </div>
      </div>
    `;
  }

  private _renderLines(c: TreeContext, l: Layout, floorViews: Pos[], roomViews: RoomView[], allRooms: boolean, allFloors: boolean): TemplateResult {
    const { model, energy, thresholds } = c;
    const floorIdx = c.sel.floor;
    const roomIdx = c.sel.room;
    const animate = c.config.options?.animation !== false && !energy;
    // energy mode: the width shows the share of the consumption of the home (or of all sources), no thresholds
    const shareOf = (v: number, total: number) => 1 + Math.min(1, Math.max(0, total > 0 ? v / total : 0)) * 5;
    const produced = model.sources.reduce((sum, s) => sum + Math.max(0, s.watts), 0);
    // a line belongs to the level of the node it leads to
    const line = (lvl: ThresholdLevel, own: ThresholdConfig[] | undefined, d: string, watts: number, active: boolean, reverse = false, opacity = 1) => {
      const dur = energy ? null : flowDuration(watts);
      // only lines of the selected path take the threshold color, the others stay muted
      const list = elementThresholds(own, thresholds[lvl]);
      const color = !energy && active && !isIdle(watts) ? thresholdColor(list, watts) : undefined;
      const level = color ? Math.min(thresholdLevel(list, watts), MAX_LEVEL) : 0;
      // a width set on the reached range replaces the width that follows the power
      const width = energy ? shareOf(watts, lvl === "source" ? produced : model.homeWatts) : (color ? thresholdWidth(list, watts) : undefined) ?? strokeWidth(watts) + level * 0.75;
      return svg`<path
        class="line ${active ? "active" : ""} ${dur && animate ? "flowing" : ""} ${reverse ? "reverse" : ""}"
        d=${d}
        stroke-width=${width}
        style=${(dur ? `--dur:${dur}s;` : "") + (color ? `stroke:${color};` : "") + (opacity < 1 ? `opacity:${opacity}` : "")}
      />`;
    };
    const parts: TemplateResult[] = [];
    model.sources.forEach((s, i) => {
      // in the energy mode the width follows the balance of delivered and returned energy
      const w = energy ? Math.abs(s.flow) : s.watts;
      parts.push(line("source", s.thresholds, curve(l.sourceXs[i], l.sourceH, l.homeX, l.yHome), w, Math.abs(w) >= 1, s.reverse));
    });
    const homeBottom = l.yHome + HOME_H;
    let roomFromX = l.homeX;
    let roomFromY = homeBottom;
    model.floors.forEach((f, i) => {
      const p = floorViews[i];
      parts.push(line("floor", f.thresholds, curve(l.homeX, homeBottom, p.x, p.y), f.watts, allFloors || i === floorIdx, false, p.o));
      if (i === floorIdx) {
        roomFromX = p.x;
        roomFromY = p.y + l.floorH;
      }
    });
    roomViews
      .filter((v) => !v.leaving)
      .forEach(({ room: r, p }, i) => {
        parts.push(line("room", r.thresholds, roomPath(roomFromX, roomFromY, p.x, p.y, l.yRoom), r.watts, allRooms || i === roomIdx, false, p.o));
      });
    return html`<svg class="lines" width=${l.width} height=${l.height}>${parts}</svg>`;
  }

  private _renderSource(c: TreeContext, s: SourceNode, x: number): TemplateResult {
    // the energy mode shows what the source delivered (import, discharged); the other direction has a line of its own
    const reverse = !c.energy && s.reverse;
    const suffix =
      s.type === "battery"
        ? reverse
          ? ` · ${c.t("charging")}`
          : s.soc !== undefined
            ? ` · ${Math.round(s.soc)} %`
            : ""
        : s.type === "grid"
          ? ` · ${c.t(reverse ? "export" : "import")}`
          : s.type === "solar" && s.share > 0
            ? ` · ${Math.round(s.share * 100)} %`
            : "";
    return html`
      <button
        class="node ${s.valid ? "" : "warn"}"
        style=${styleMap({ left: `${x}px`, top: "0px", "--node-color": s.color ?? "" })}
        title=${s.valid ? s.name : `${s.name}: ${c.t(s.noEnergy ? "no_energy" : "unavailable")}`}
        @click=${() => c.moreInfo(s.entity)}
      >
        <span class="circle source"><ha-icon icon=${s.icon ?? SOURCE_ICONS[s.type]}></ha-icon></span>
        <span class="label">${s.name}${suffix}</span>
        <span class="value">${c.fmt(s.watts)}</span>
        ${s.returnCounter
          ? html`<span class="second back">${c.t(s.type === "grid" ? "return_grid" : s.type === "battery" ? "return_battery" : "return_generic").replace("{0}", s.returned !== undefined ? c.fmt(s.returned) : "–")}</span>`
          : c.energy && c.model.sources.some((x) => x.returnCounter)
            ? html`<span class="second back"></span>`
            : nothing}
        ${secondLine(c, nodeKey.source(s.entity))}
      </button>
    `;
  }

  /** Clicking the home selects everything: all floors, or all rooms without floors. */
  private _renderHome(c: TreeContext, l: Layout, everything: boolean): TemplateResult {
    return html`
      <button
        class="node"
        style=${styleMap({ left: `${l.homeX}px`, top: `${l.yHome}px` })}
        aria-pressed=${everything}
        title=${c.home}
        @click=${() => c.select(c.model.floors.length ? { floor: null } : { room: null })}
      >
        <span class="circle home">
          <ha-icon icon="mdi:home"></ha-icon>
          <span>${c.fmt(c.model.homeWatts)}</span>
        </span>
        ${c.secondary && c.second(nodeKey.home) ? html`<span class="second home-second" title=${c.secondTitle?.(nodeKey.home) ?? nothing}>${c.second(nodeKey.home)}</span>` : nothing}
      </button>
    `;
  }

  private _renderFloor(c: TreeContext, id: string, name: string, watts: number, color: string | undefined, p: Pos, selected: boolean, allFloors = false, meter?: MeterInfo): TemplateResult {
    return html`
      <button
        class="node ${isIdle(watts) ? "idle" : ""} ${p.o < 0.5 ? "ghost" : ""}"
        style=${styleMap({ left: `${p.x}px`, top: `${p.y}px`, opacity: fade(p.o, isIdle(watts)), "--node-color": color ?? "" })}
        aria-pressed=${selected}
        aria-hidden=${p.o < 0.5 ? "true" : nothing}
        tabindex=${p.o < 0.5 ? "-1" : nothing}
        title=${name}
        @click=${() => c.select(selected && !c.focus ? { floor: null } : { floor: id })}
      >
        <span class="pill ${selected || allFloors ? "selected" : ""}">${name}<small>${c.fmt(watts)}</small>${meterMark(c, meter, "rooms")}${c.secondary ? html`<span class="second" title=${c.secondTitle?.(nodeKey.floor(id)) ?? nothing}>${c.second(nodeKey.floor(id)) ?? ""}</span>` : nothing}</span>
      </button>
    `;
  }

  private _renderRoom(c: TreeContext, r: RoomNode, p: Pos, colW: number, selected: boolean, allRooms = false, leaving = false): TemplateResult {
    return html`
      <button
        class="node ${isIdle(r.watts) ? "idle" : ""} ${colW < TIGHT_COL_W ? "tight" : ""} ${p.o < 0.5 || leaving ? "ghost" : ""}"
        style=${styleMap({ left: `${p.x}px`, top: `${p.y}px`, width: `${Math.max(0, colW - 4)}px`, opacity: fade(p.o, isIdle(r.watts)), "--node-color": r.color ?? "" })}
        aria-pressed=${selected}
        aria-hidden=${p.o < 0.5 || leaving ? "true" : nothing}
        tabindex=${p.o < 0.5 || leaving ? "-1" : nothing}
        title=${r.name}
        @click=${() => c.select({ ...c.stored, room: selected && !c.focus ? null : r.id })}
      >
        <span class="circle room ${selected || allRooms ? "selected" : ""}"><ha-icon icon=${r.icon ?? "mdi:door"}></ha-icon>${meterMark(c, r.meter, "consumers")}</span>
        <span class="label">${r.name}</span>
        <span class="value">${c.fmt(r.watts)}</span>
        ${secondLine(c, nodeKey.room(r.id))}
      </button>
    `;
  }
}
