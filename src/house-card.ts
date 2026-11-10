import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import { cardStyles } from "./styles/theme";
import { collectEntityIds } from "./model/config";
import { runAction, type ActionConfig, type ActionDeps, type NodeActions } from "./model/actions";
import { computeModel, type ConsumerNode, type EnergyModel } from "./model/compute";
import { HOUSE_CARD_TYPE, NARROW_PX, orderFloors, validateHouseConfig, type HouseConfig, type HouseSelection } from "./model/house";
import { buildHouseScene } from "./model/house-scene";
import {
  houseActionsOf,
  houseGestureOf,
  houseDetail,
  houseSelectionKey,
  parseHouseSelection,
  resolveHouseSelection,
  toggleHouseSelection,
  type HouseDetail,
  type HouseDetailRow,
} from "./model/house-selection";
import { RegistrySource, resolveNames, type AreaEntry, type FloorEntry } from "./model/registry";
import { powerReader, socReader } from "./model/readers";
import { elementThresholds, isIdle, resolveThresholds, thresholdColor, thresholdLevel, thresholdWidth } from "./model/thresholds";
import { buildStubConfig, type StubHass } from "./model/stub-config";
import { formatPower, type StateLike } from "./model/units";
import { localize, sourceNames, type Key } from "./localize";
import { MAX_LEVEL } from "./view/tree";
import { Gesture } from "./view/gesture";
import { renderHouse } from "./view/house";
import { defineOnce, registerCardOnce } from "./register";
import "./editor/house-editor";

interface Hass {
  language?: string;
  locale?: { language?: string };
  config?: { location_name?: string };
  areas?: Record<string, AreaEntry | undefined>;
  floors?: Record<string, FloorEntry | undefined>;
  callWS<T>(msg: Record<string, unknown>): Promise<T>;
  callService?(domain: string, service: string, data?: Record<string, unknown>, target?: Record<string, unknown>): Promise<unknown>;
  states: Record<string, StateLike | undefined>;
}

/**
 * The 3D card: the home as floors in isometric view (variant A of the mocks). It reads the same numbers as the energy
 * card (`computeModel`), builds the scene (AP2) and draws it (AP3); below the graphic a detail list carries the same
 * values as text. A tap on a floor or room selects it (remembered under its own storage prefix), hold and double tap run
 * the actions of the config.
 */
export class DetailedEnergy3DCard extends LitElement {
  static styles = [
    cardStyles,
    css`
      :host {
        display: block;
      }
      .error {
        color: var(--_muted);
        font-size: 0.85em;
        padding: 20px 0;
        text-align: center;
      }
      svg {
        display: block;
        width: 100%;
      }
      .detail .crumb {
        background: none;
        border: none;
        color: var(--_muted);
        cursor: pointer;
        font: inherit;
        padding: 0 4px 0 0;
      }
      .detail .crumb:hover,
      .detail .crumb:focus-visible {
        color: var(--primary-text-color);
      }
    `,
  ];

  @state() private _config?: HouseConfig;
  @state() private _error?: string;
  @state() private _sel: HouseSelection = {};
  /** card width in px (0 until measured), for the narrow graphic without room labels */
  @state() private _width = 0;
  /** false while the card is scrolled out of view: the flow lines stand still */
  @state() private _visible = true;

  private _hass?: Hass;
  private _entityIds: string[] = [];
  private _model?: EnergyModel;
  private _thresholds = resolveThresholds(undefined, undefined);
  /** config with names from the registry; rebuilt only when the config or the registry changes */
  private _resolved?: { reg: object; cfg: HouseConfig };
  private _registries = new RegistrySource(() => {
    this._recompute();
    this.requestUpdate();
  });
  private _ro?: ResizeObserver;
  private _io?: IntersectionObserver;
  /** one gesture per element, so that a hold or a double tap survives the re-renders in between */
  private _gestures = new Map<string, Gesture>();

  static getConfigElement(): HTMLElement {
    return document.createElement(`${HOUSE_CARD_TYPE}-editor`);
  }

  /** The stub of the energy card with the type of this card. */
  static getStubConfig(hass?: StubHass): Record<string, unknown> {
    return { ...buildStubConfig(hass), type: `custom:${HOUSE_CARD_TYPE}` };
  }

  setConfig(config: unknown): void {
    try {
      this._config = validateHouseConfig(config);
      this._error = undefined;
      this._entityIds = collectEntityIds(this._config);
      this._thresholds = resolveThresholds(this._config.colors?.thresholds, this._config.colors?.level_thresholds);
      this._resolved = undefined;
      this._gestures.clear();
      this._sel = this._loadSelection();
    } catch (e) {
      this._error = (e as Error).message;
      this._config = undefined;
      this._model = undefined;
    }
    this._recompute();
  }

  set hass(hass: Hass) {
    const old = this._hass;
    this._hass = hass;
    this._registries.ensure(hass);
    // only draw again when a referenced entity, the language or the floor / area registry changed
    const registryChanged = !!old && (old.areas !== hass.areas || old.floors !== hass.floors);
    const displayChanged = !!old && (old.locale?.language !== hass.locale?.language || old.language !== hass.language);
    if (old && !registryChanged && !displayChanged && this._entityIds.every((id) => old.states[id] === hass.states[id])) return;
    this._recompute();
    this.requestUpdate();
  }

  getCardSize(): number {
    return 8;
  }

  getGridOptions() {
    return { columns: 12, rows: "auto", min_columns: 6 };
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(() => {
        const w = this.clientWidth;
        if (w && Math.abs(w - this._width) > 1) this._width = w;
      });
      this._ro.observe(this);
    }
    // stand still while the card is not visible
    if (typeof IntersectionObserver !== "undefined") {
      this._io = new IntersectionObserver((entries) => {
        const last = entries[entries.length - 1];
        if (last) this._visible = last.isIntersecting;
      });
      this._io.observe(this);
    }
  }

  disconnectedCallback(): void {
    this._ro?.disconnect();
    this._io?.disconnect();
    this._ro = this._io = undefined;
    super.disconnectedCallback();
  }

  // ---------- state ----------

  /** Config with the names of the registry and the floors bottom to top (or as it is while the registry is not there yet). */
  private get _namedConfig(): HouseConfig | undefined {
    const cfg = this._config;
    if (!cfg) return undefined;
    const reg = this._registries.get(this._hass);
    if (!reg) return cfg;
    if (this._resolved?.reg !== reg) {
      const named = resolveNames(cfg, reg) as HouseConfig;
      // the scene stacks floors in the order of the config: bottom to top by registry level
      this._resolved = { reg, cfg: named.floors ? { ...named, floors: orderFloors(named.floors, reg.floors) } : named };
    }
    return this._resolved.cfg;
  }

  /** The numbers of the card: the same model as the energy card shows (power mode). */
  private _recompute(): void {
    const cfg = this._namedConfig;
    if (!cfg || !this._hass) {
      this._model = undefined;
      return;
    }
    const states = this._hass.states;
    this._model = computeModel(cfg, powerReader(states), socReader(states), sourceNames(this._lang));
  }

  private get _lang(): string | undefined {
    return this._hass?.locale?.language ?? this._hass?.language;
  }

  private get _remember(): boolean {
    return this._config?.options?.remember_selection !== false;
  }

  private _loadSelection(): HouseSelection {
    if (!this._remember) return {};
    try {
      return parseHouseSelection(localStorage.getItem(houseSelectionKey(this._config)));
    } catch {
      return {};
    }
  }

  private _select(target: HouseSelection): void {
    this._sel = toggleHouseSelection(this._model, this._sel, target);
    this._store();
  }

  /** Selects exactly this (no toggling), for the buttons of the detail list. */
  private _set(sel: HouseSelection): void {
    this._sel = resolveHouseSelection(this._model, sel);
    this._store();
  }

  private _store(): void {
    if (!this._remember) return;
    try {
      localStorage.setItem(houseSelectionKey(this._config), JSON.stringify(this._sel));
    } catch {
      /* storage may be unavailable */
    }
  }

  // ---------- helpers ----------

  private _t(key: Key): string {
    return localize(this._lang, key);
  }

  private _fmt(watts: number): string {
    const o = this._config?.options;
    return formatPower(watts, o?.unit ?? "W", o?.decimals ?? 2, this._lang);
  }

  /** Flow lines run with options.animation (default on), unless the user prefers reduced motion or the card is out of view. */
  private get _animate(): boolean {
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    return this._config?.options?.animation !== false && !reduced && this._visible;
  }

  private _consumerName(c: ConsumerNode): string {
    if (c.name) return c.name;
    if (c.noSensor) return this._t("consumer_unnamed");
    return String(this._hass?.states[c.entity]?.attributes.friendly_name ?? c.entity);
  }

  // ---------- actions ----------

  private _actionDeps(): ActionDeps {
    return {
      callService: (domain, service, data, target) => this._hass?.callService?.(domain, service, data, target),
      moreInfo: (id) => this._moreInfo(id),
      navigate: (path) => {
        history.pushState(null, "", path);
        window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
      },
      open: (url) => void window.open(url, "_blank", "noreferrer"),
      confirm: (text) => window.confirm(text),
      confirmText: this._t("confirm_action"),
    };
  }

  private _moreInfo(entityId: string): void {
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }

  private _run(a: ActionConfig | undefined, entity?: string): void {
    if (a && a.action !== "none") void runAction(a, entity, this._actionDeps());
  }

  /** Tap in the graphic: the tap action of the floor or room if it has one, else select it. */
  private _onTap(target: HouseSelection): void {
    const actions = houseActionsOf(this._model, target);
    if (actions?.tap) this._run(actions.tap, actions.entity);
    else this._select(target);
  }

  /** Hold and double tap in the graphic run the actions of the config; without one nothing happens. */
  private _onAction(target: HouseSelection, kind: "hold" | "double"): void {
    const g = houseGestureOf(this._model, target, kind);
    this._run(g?.action, g?.entity);
  }

  /** Tap, hold and double tap of one element of the list; a tap without an action does `fallback`. */
  private _bind(key: string, actions: NodeActions | undefined, fallback: () => void) {
    let gesture = this._gestures.get(key);
    if (!gesture) this._gestures.set(key, (gesture = new Gesture()));
    const real = (a: ActionConfig | undefined) => !!a && a.action !== "none";
    gesture.update({
      hold: real(actions?.hold),
      double: real(actions?.double),
      onTap: () => (actions?.tap ? this._run(actions.tap, actions.entity) : fallback()),
      onHold: () => this._run(actions?.hold, actions?.entity),
      onDouble: () => this._run(actions?.double, actions?.entity),
    });
    const g = gesture;
    return {
      click: () => g.click(),
      down: () => g.down(),
      up: () => g.up(),
      // a long press on a touch screen opens the context menu: not when the press is a hold action
      contextmenu: (e: Event) => {
        if (real(actions?.hold)) e.preventDefault();
      },
    };
  }

  // ---------- render ----------

  protected render(): TemplateResult {
    if (this._error) return html`<ha-card><div class="error">${this._error}</div></ha-card>`;
    const cfg = this._namedConfig;
    const model = this._model;
    if (!cfg || !model) return html`<ha-card></ha-card>`;
    const sel = resolveHouseSelection(model, this._sel);
    const scene = buildHouseScene({ model, config: cfg, selection: sel, format: (w) => this._fmt(w), lang: this._lang });
    const detail = cfg.options?.show_consumers === false ? undefined : houseDetail(model, sel, cfg.options?.only_active_consumers === true);
    return html`<ha-card .header=${cfg.title}>
      <div class="house">
        ${renderHouse(scene, {
          narrow: this._width > 0 && this._width < NARROW_PX,
          animate: this._animate,
          lang: this._lang,
          onSelect: (t) => this._onTap(t),
          onAction: (t, kind) => this._onAction(t, kind),
          hasAction: (t, kind) => !!houseGestureOf(model, t, kind),
        })}
        ${detail ? this._renderDetail(detail, cfg) : nothing}
      </div>
    </ha-card>`;
  }

  /** The list below the graphic: the same values as text, and the way in for keyboard and screen reader users. */
  private _renderDetail(d: HouseDetail, cfg: HouseConfig): TemplateResult {
    const crumb =
      d.scope === "home"
        ? html`<b>${this._t("house_detail_home")}</b>`
        : html`<button class="crumb" @click=${() => this._set({})}>${this._t("house_detail_home")} ›</button>${d.scope === "room" && this._sel.floor_id ? this._floorCrumb() : nothing}<b>${d.name}</b>`;
    const consumerRows = d.rows.filter((r) => r.kind === "consumer");
    const max = Math.max(1, ...d.rows.filter((r) => r.kind !== "remainder").map((r) => r.watts));
    const empty = d.rows.length === 0 ? this._emptyText(d) : undefined;
    return html`<div class="detail">
      <div class="detail-head">
        <span>${crumb}<span class="muted"> · ${this._fmt(d.watts)}</span></span>
        ${consumerRows.length || d.scope === "room"
          ? html`<span class="muted">${d.shown === d.total ? d.total : `${d.shown} / ${d.total}`} ${this._t("consumers")}</span>`
          : nothing}
      </div>
      ${empty ? html`<div class="empty">${empty}</div>` : nothing}
      <div class="list">${d.rows.map((r) => this._renderRow(r, max, cfg))}</div>
    </div>`;
  }

  private _floorCrumb(): TemplateResult | typeof nothing {
    const id = this._sel.floor_id;
    const floor = this._model?.floors.find((f) => f.id === id);
    if (!floor) return nothing;
    const floorName = (this._namedConfig?.floors ?? []).find((f) => f.floor_id === id)?.name ?? floor.name;
    return html`<button class="crumb" @click=${() => this._set({ floor_id: floor.id })}>${floorName} ›</button>`;
  }

  private _emptyText(d: HouseDetail): string {
    if (d.scope === "home") return this._model?.floors.length || this._model?.rooms.length ? "" : this._t("no_rooms");
    if (d.scope === "room") return d.total === 0 ? this._t("no_consumers") : this._t("no_active_consumers");
    if (d.scope === "source") return this._t("house_detail_source_none");
    return "";
  }

  private _renderRow(r: HouseDetailRow, max: number, cfg: HouseConfig): TemplateResult {
    if (r.kind === "remainder") {
      const rem = r.remainder;
      if (cfg.options?.show_unassigned === false) return html``;
      if (rem.excess !== undefined) {
        const text = this._t(rem.scope === "floor" ? "excess_rooms" : "excess_consumers").replace("{0}", this._fmt(rem.excess));
        return html`<div class="row excess" style="cursor:default"><span class="name"><ha-icon icon="mdi:alert-outline"></ha-icon> ${text}</span><span></span><span class="val"></span></div>`;
      }
      if (rem.value < 1) return html``;
      const name = rem.scope === "home" ? this._t("unassigned") : this._t("unassigned_in").replace("{0}", rem.name ?? "");
      return html`<div class="row" style="cursor:default"><span class="name">${name}</span><span></span><span class="val">${this._fmt(rem.value)}</span></div>`;
    }
    if (r.kind === "consumer") {
      const c = r.consumer;
      const list = elementThresholds(c.thresholds, this._thresholds.consumer);
      const color = thresholdColor(list, c.watts);
      const level = color ? Math.min(thresholdLevel(list, c.watts), MAX_LEVEL) : 0;
      const width = color ? thresholdWidth(list, c.watts) : undefined;
      const b = this._bind(`c:${c.entity}`, c.actions, () => (c.noSensor ? undefined : this._moreInfo(c.entity)));
      const showIds = cfg.options?.show_entity_ids !== false;
      return html`<button class="row ${c.valid || c.noPower ? "" : "warn"} ${c.noPower || (c.valid && isIdle(c.watts)) ? "idle" : ""}"
        @click=${() => b.click()} @pointerdown=${() => b.down()} @pointerup=${() => b.up()} @pointerleave=${() => b.up()} @pointercancel=${() => b.up()} @contextmenu=${(e: Event) => b.contextmenu(e)}>
        <span class="name">${this._consumerName(c)}${c.noSensor || c.noPower || showIds ? html`<small>${c.noSensor ? this._t("no_sensor") : c.noPower ? this._t("no_power") : c.entity}</small>` : nothing}</span>
        <span class="bar" style=${styleMap({ "--level": String(level), ...(width !== undefined ? { "--bar-h": `${width}px` } : {}) })}><div style=${styleMap({ width: `${(c.watts / max) * 100}%`, background: color })}></div></span>
        <span class="val">${c.valid ? this._fmt(c.watts) : "–"}</span>
      </button>`;
    }
    // a floor or a room: select it
    const target: HouseSelection = r.kind === "floor" ? { floor_id: r.id } : { floor_id: r.floor_id, area_id: r.id };
    const actions = houseActionsOf(this._model, target);
    const b = this._bind(`${r.kind}:${r.id}`, actions, () => this._set(target));
    return html`<button class="row" @click=${() => b.click()} @pointerdown=${() => b.down()} @pointerup=${() => b.up()} @pointerleave=${() => b.up()} @pointercancel=${() => b.up()} @contextmenu=${(e: Event) => b.contextmenu(e)}>
      <span class="name">${r.icon ? html`<ha-icon icon=${r.icon}></ha-icon> ` : nothing}${r.name}</span>
      <span class="bar"><div style=${styleMap({ width: `${(r.watts / max) * 100}%` })}></div></span>
      <span class="val">${this._fmt(r.watts)}</span>
    </button>`;
  }
}

defineOnce(HOUSE_CARD_TYPE, DetailedEnergy3DCard);
window.customCards ??= [];
registerCardOnce(window.customCards, {
  type: HOUSE_CARD_TYPE,
  name: "Detailed Energy 3D",
  description: localize(typeof navigator === "undefined" ? undefined : navigator.language, "house_picker_description"),
  preview: false,
});
