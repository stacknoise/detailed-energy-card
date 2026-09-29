import { LitElement, html, nothing, svg, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import { cardStyles, colorVars } from "./styles/theme";
import { collectEntityIds, validateConfig, type EnergyCardConfig } from "./model/config";
import { computeModel, type EnergyModel, type RoomNode, type SourceNode } from "./model/compute";
import { formatPower, stateToWatts, type StateLike } from "./model/units";
import { localize, type Key } from "./localize";
import "./editor/card-editor";
import { loadRegistries, resolveNames, type Registries } from "./model/registry";
import {
  computeLayout,
  curve,
  flowDuration,
  strokeWidth,
  FLOOR_H,
  HOME_H,
  SOURCE_H,
  type Layout,
} from "./view/layout";

interface Hass {
  language?: string;
  locale?: { language?: string };
  config?: { location_name?: string };
  callWS<T>(msg: { type: string }): Promise<T>;
  states: Record<string, StateLike | undefined>;
}

interface Selection {
  floor?: string;
  /** undefined = default (largest room), null = explicitly none selected */
  room?: string | null;
}

const SOURCE_ICONS: Record<string, string> = {
  solar: "mdi:white-balance-sunny",
  battery: "mdi:battery-high",
  grid: "mdi:transmission-tower",
  generic: "mdi:flash",
};

const hashOf = (s: string): string => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

@customElement("energy-card")
export class EnergyCard extends LitElement {
  static styles = cardStyles;

  @state() private _config?: EnergyCardConfig;
  @state() private _error?: string;
  @state() private _width = 0;
  @state() private _sel: Selection = {};

  private _hass?: Hass;
  private _entityIds: string[] = [];
  private _model?: EnergyModel;
  private _ro?: ResizeObserver;
  private _reg?: Registries;
  private _regLoading = false;

  static getConfigElement(): HTMLElement {
    return document.createElement("energy-card-editor");
  }

  static getStubConfig(hass?: Hass): Record<string, unknown> {
    const power = Object.entries(hass?.states ?? {})
      .filter(([id, s]) => id.startsWith("sensor.") && s?.attributes?.device_class === "power")
      .map(([id]) => id);
    return {
      title: "Energiefluss",
      sources: power.slice(0, 1).map((entity) => ({ entity, type: "grid", name: "Netz" })),
    };
  }

  setConfig(config: EnergyCardConfig): void {
    try {
      this._config = validateConfig(config);
      this._error = undefined;
      this._entityIds = collectEntityIds(this._config);
      this._sel = this._loadSelection();
    } catch (e) {
      this._error = (e as Error).message;
      this._config = undefined;
    }
    this._recompute();
  }

  set hass(hass: Hass) {
    const old = this._hass;
    this._hass = hass;
    this._ensureRegistries();
    // Only re-render when a referenced entity changed.
    if (old && this._entityIds.every((id) => old.states[id] === hass.states[id])) return;
    this._recompute();
    this.requestUpdate();
  }

  /** Floor and area names come from Home Assistant; load them once. */
  private _ensureRegistries(): void {
    if (this._reg || this._regLoading || !this._hass?.callWS) return;
    this._regLoading = true;
    loadRegistries(this._hass)
      .then((reg) => {
        this._reg = reg;
        this._recompute();
        this.requestUpdate();
      })
      .catch(() => {
        /* fall back to ids; retried on the next hass update */
      })
      .finally(() => (this._regLoading = false));
  }

  getCardSize(): number {
    return 8;
  }

  getGridOptions() {
    return { columns: 12, rows: "auto", min_columns: 6 };
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._ro = new ResizeObserver(() => {
      const w = this.renderRoot.querySelector<HTMLElement>(".scroll")?.clientWidth ?? 0;
      if (w && Math.abs(w - this._width) > 1) this._width = w;
    });
  }

  disconnectedCallback(): void {
    this._ro?.disconnect();
    super.disconnectedCallback();
  }

  protected updated(): void {
    const el = this.renderRoot.querySelector(".scroll");
    if (el && this._ro) {
      this._ro.disconnect();
      this._ro.observe(el);
    }
  }

  // ---------- state ----------

  private _recompute(): void {
    if (!this._config || !this._hass) return;
    const states = this._hass.states;
    const cfg = this._reg ? resolveNames(this._config, this._reg) : this._config;
    this._model = computeModel(cfg, (id) => {
      const w = stateToWatts(states[id]);
      // SoC and other non-power sensors are plain numbers: fall back to the raw value
      if (w === null) {
        const n = Number(states[id]?.state);
        return Number.isFinite(n) && states[id]?.state !== "" ? { watts: n, valid: true } : { watts: 0, valid: false };
      }
      return { watts: w, valid: true };
    });
  }

  private get _storageKey(): string {
    return `energy-card:${hashOf(JSON.stringify(this._config ?? {}))}`;
  }

  private _loadSelection(): Selection {
    if (this._config?.options?.remember_selection === false) return {};
    try {
      return JSON.parse(localStorage.getItem(this._storageKey) ?? "{}");
    } catch {
      return {};
    }
  }

  private _select(sel: Selection): void {
    this._sel = sel;
    if (this._config?.options?.remember_selection === false) return;
    try {
      localStorage.setItem(this._storageKey, JSON.stringify(sel));
    } catch {
      /* storage may be unavailable */
    }
  }

  /** Applies the stored selection, falling back to the largest floor / room. */
  private _resolve(model: EnergyModel): { floor?: number; rooms: RoomNode[]; room?: number } {
    const largest = <T extends { watts: number }>(list: T[]) =>
      list.reduce((best, x, i) => (x.watts > list[best].watts ? i : best), 0);
    let floor: number | undefined;
    let rooms = model.rooms;
    if (model.floors.length) {
      const i = model.floors.findIndex((f) => f.name === this._sel.floor);
      floor = i >= 0 ? i : largest(model.floors);
      rooms = model.floors[floor].rooms;
    }
    const r = rooms.findIndex((x) => x.name === this._sel.room);
    const room = !rooms.length || this._sel.room === null ? undefined : r >= 0 ? r : largest(rooms);
    return { floor, rooms, room };
  }

  // ---------- helpers ----------

  private _t(key: Key): string {
    return localize(this._hass?.locale?.language ?? this._hass?.language, key);
  }

  private _fmt(watts: number): string {
    const o = this._config?.options;
    return formatPower(watts, o?.unit ?? "W", o?.decimals ?? 2, this._hass?.locale?.language ?? this._hass?.language);
  }

  private _moreInfo(entityId: string): void {
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }

  // ---------- render ----------

  protected render(): TemplateResult {
    if (this._error) return html`<ha-card><div class="error">${this._error}</div></ha-card>`;
    const cfg = this._config;
    const model = this._model;
    if (!cfg || !model) return html`<ha-card></ha-card>`;

    const sel = this._resolve(model);
    const layout = computeLayout({
      width: this._width || 320,
      sources: model.sources.length,
      floors: model.floors.length,
      rooms: sel.rooms.length,
      wrap: cfg.options?.wrap_rooms === true,
    });
    const floor = sel.floor !== undefined ? model.floors[sel.floor] : undefined;
    const room = sel.room !== undefined ? sel.rooms[sel.room] : undefined;
    const home = this._hass?.config?.location_name ?? this._t("home");
    // No single room selected: all rooms of the visible row count as selected.
    const allRooms = sel.rooms.length > 0 && !room;
    const detailRoom: RoomNode | undefined = allRooms
      ? {
          name: floor?.name ?? home,
          icon: floor?.icon ?? "mdi:home",
          color: floor?.color,
          watts: sel.rooms.reduce((sum, r) => sum + r.watts, 0),
          consumers: sel.rooms.flatMap((r) => r.consumers),
        }
      : room;
    const path = [home, floor?.name, room?.name].filter(Boolean).join(" › ");

    return html`
      <ha-card style=${colorVars(cfg.colors)}>
        <header>
          <div>
            ${cfg.title ? html`<h2>${cfg.title}</h2>` : nothing}
            <div class="path">${path}</div>
          </div>
          ${model.autarky !== null
            ? html`<div class="badge">${this._t("autarky")} ${Math.round(model.autarky * 100)} %</div>`
            : nothing}
        </header>
        <div class="scroll">
          <div class="graph" style=${styleMap({ width: `${layout.width}px`, height: `${layout.height}px` })}>
            ${this._renderLines(model, layout, sel.floor, sel.room, allRooms)}
            ${model.sources.map((s, i) => this._renderSource(s, layout.sourceXs[i]))}
            ${this._renderHome(model, layout, home)}
            ${model.floors.map((f, i) => this._renderFloor(f.name, f.watts, f.color, layout.floorXs[i], layout.yFloor, i === sel.floor))}
            ${sel.rooms.map((r, i) => this._renderRoom(r, layout.roomXs[i], layout.roomYs[i], i === sel.room, allRooms))}
          </div>
        </div>
        ${this._renderDetail(model, detailRoom)}
      </ha-card>
    `;
  }

  private _renderLines(model: EnergyModel, l: Layout, floorIdx?: number, roomIdx?: number, allRooms = false): TemplateResult {
    const animate = this._config?.options?.animation !== false;
    const line = (d: string, watts: number, active: boolean, reverse = false) => {
      const dur = flowDuration(watts);
      return svg`<path
        class="line ${active ? "active" : ""} ${dur && animate ? "flowing" : ""} ${reverse ? "reverse" : ""}"
        d=${d}
        stroke-width=${strokeWidth(watts)}
        style=${dur ? `--dur:${dur}s` : ""}
      />`;
    };
    const parts: TemplateResult[] = [];
    model.sources.forEach((s, i) => {
      parts.push(line(curve(l.sourceXs[i], SOURCE_H, l.homeX, l.yHome), s.watts, Math.abs(s.watts) >= 1, s.reverse));
    });
    const homeBottom = l.yHome + HOME_H;
    let roomFromX = l.homeX;
    let roomFromY = homeBottom;
    model.floors.forEach((f, i) => {
      parts.push(line(curve(l.homeX, homeBottom, l.floorXs[i], l.yFloor), f.watts, i === floorIdx));
      if (i === floorIdx) {
        roomFromX = l.floorXs[i];
        roomFromY = l.yFloor + FLOOR_H;
      }
    });
    const rooms = floorIdx !== undefined ? model.floors[floorIdx].rooms : model.rooms;
    rooms.forEach((r, i) => {
      parts.push(line(curve(roomFromX, roomFromY, l.roomXs[i], l.roomYs[i]), r.watts, allRooms || i === roomIdx));
    });
    return html`<svg class="lines" width=${l.width} height=${l.height}>${parts}</svg>`;
  }

  private _renderSource(s: SourceNode, x: number): TemplateResult {
    const suffix =
      s.type === "battery"
        ? s.reverse
          ? ` · ${this._t("charging")}`
          : s.soc !== undefined
            ? ` · ${Math.round(s.soc)} %`
            : ""
        : s.type === "grid"
          ? ` · ${this._t(s.reverse ? "export" : "import")}`
          : s.type === "solar" && s.share > 0
            ? ` · ${Math.round(s.share * 100)} %`
            : "";
    return html`
      <button
        class="node ${s.valid ? "" : "warn"}"
        style=${styleMap({ left: `${x}px`, top: "0px", "--node-color": s.color ?? "" })}
        title=${s.valid ? s.name : `${s.name}: ${this._t("unavailable")}`}
        @click=${() => this._moreInfo(s.entity)}
      >
        <span class="circle source"><ha-icon icon=${s.icon ?? SOURCE_ICONS[s.type]}></ha-icon></span>
        <span class="label">${s.name}${suffix}</span>
        <span class="value">${this._fmt(s.watts)}</span>
      </button>
    `;
  }

  private _renderHome(model: EnergyModel, l: Layout, name: string): TemplateResult {
    return html`
      <div class="node" style=${styleMap({ left: `${l.homeX}px`, top: `${l.yHome}px`, cursor: "default" })} title=${name}>
        <span class="circle home">
          <ha-icon icon="mdi:home"></ha-icon>
          <span>${this._fmt(model.homeWatts)}</span>
        </span>
      </div>
    `;
  }

  private _renderFloor(name: string, watts: number, color: string | undefined, x: number, y: number, selected: boolean): TemplateResult {
    return html`
      <button
        class="node"
        style=${styleMap({ left: `${x}px`, top: `${y}px`, "--node-color": color ?? "" })}
        aria-pressed=${selected}
        title=${name}
        @click=${() => this._select({ floor: name })}
      >
        <span class="pill ${selected ? "selected" : ""}">${name}<small>${this._fmt(watts)}</small></span>
      </button>
    `;
  }

  private _renderRoom(r: RoomNode, x: number, y: number, selected: boolean, allRooms = false): TemplateResult {
    return html`
      <button
        class="node"
        style=${styleMap({ left: `${x}px`, top: `${y}px`, "--node-color": r.color ?? "" })}
        aria-pressed=${selected}
        title=${r.name}
        @click=${() => this._select({ ...this._sel, room: selected ? null : r.name })}
      >
        <span class="circle room ${selected || allRooms ? "selected" : ""}"><ha-icon icon=${r.icon ?? "mdi:door"}></ha-icon></span>
        <span class="label">${r.name}</span>
        <span class="value">${this._fmt(r.watts)}</span>
      </button>
    `;
  }

  private _renderDetail(model: EnergyModel, room?: RoomNode): TemplateResult {
    if (!room) {
      return html`<div class="detail empty">${this._t("no_rooms")}</div>`;
    }
    const sorted = [...room.consumers].sort((a, b) => b.watts - a.watts);
    const max = Math.max(1, ...sorted.map((c) => c.watts));
    const showUnassigned = this._config?.options?.show_unassigned !== false && model.unassigned >= 1;
    return html`
      <div class="detail">
        <div class="detail-head">
          <span><ha-icon icon=${room.icon ?? "mdi:door"}></ha-icon> <b>${room.name}</b>
            <span class="muted"> · ${this._fmt(room.watts)}</span></span>
          <span class="muted">${room.consumers.length} ${this._t("consumers")}</span>
        </div>
        ${sorted.length === 0 ? html`<div class="empty">${this._t("no_consumers")}</div>` : nothing}
        ${sorted.map((c) => {
          const name = c.name ?? this._hass?.states[c.entity]?.attributes.friendly_name ?? c.entity;
          return html`
            <button class="row ${c.valid ? "" : "warn"}" @click=${() => this._moreInfo(c.entity)}>
              <span class="name">${name}<small>${c.entity}</small></span>
              <span class="bar"><div style=${styleMap({ width: `${(c.watts / max) * 100}%` })}></div></span>
              <span class="val">${c.valid ? this._fmt(c.watts) : "–"}</span>
            </button>
          `;
        })}
        ${showUnassigned
          ? html`<div class="row" style="cursor:default">
              <span class="name">${this._t("unassigned")}</span><span></span>
              <span class="val">${this._fmt(model.unassigned)}</span>
            </div>`
          : nothing}
      </div>
    `;
  }
}

declare global {
  interface Window {
    customCards?: Array<Record<string, unknown>>;
  }
}
window.customCards ??= [];
window.customCards.push({
  type: "energy-card",
  name: "Energy Card",
  description: "Energiefluss von Quellen über Etagen und Räume bis zu den Verbrauchern",
  preview: true,
});
