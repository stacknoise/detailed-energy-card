import { LitElement, html, nothing, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import { cardStyles, colorVars } from "./styles/theme";
import { collectEnergyIds, collectEntityIds, hasEnergy, validateConfig, type EnergyCardConfig } from "./model/config";
import { energyReader, firstWeekdayIndex, loadEnergySeries, offeredPeriods, periodRange, statPeriodFor, type EnergyPeriod } from "./model/energy";
import { EnergyStore, type EnergyQuery } from "./model/energy-store";
import { computeModel, listRemainder, listedConsumers, nodeKey, nodeValues, type EnergyModel, type Remainder, type RoomNode } from "./model/compute";
import { formatEnergy, formatPower, type StateLike } from "./model/units";
import { powerReader, socReader } from "./model/readers";
import { elementThresholds, isIdle, resolveThresholds, thresholdColor, thresholdLevel, thresholdWidth } from "./model/thresholds";
import { localize, sourceNames, type Key } from "./localize";
import { buildStubConfig, type StubHass } from "./model/stub-config";
import "./editor/card-editor";
import { defineOnce, logBannerOnce, registerCardOnce, type BannerTarget } from "./register";
import { RegistrySource, resolveNames, type AreaEntry, type FloorEntry } from "./model/registry";
import { MAX_LEVEL, TreeView, type ResolvedSelection, type TreeContext } from "./view/tree";
import { AVAILABLE_VIEWS, VIEW_ICONS, offeredViews, parseShown, type ViewId } from "./view/views";
import { parseSelection, removeLegacyKeysOnce, selectionKey, type Selection } from "./model/selection";
interface Hass {
  language?: string;
  locale?: { language?: string; first_weekday?: string };
  config?: { location_name?: string; time_zone?: string };
  areas?: Record<string, AreaEntry | undefined>;
  floors?: Record<string, FloorEntry | undefined>;
  callWS<T>(msg: Record<string, unknown>): Promise<T>;
  states: Record<string, StateLike | undefined>;
}

export class DetailedEnergyCard extends LitElement {
  static styles = cardStyles;

  @state() private _config?: EnergyCardConfig;
  @state() private _error?: string;
  @state() private _width = 0;
  @state() private _sel: Selection = {};
  /** "power": the power now; "energy": the energy of a period (needs energy sensors) */
  @state() private _mode: "power" | "energy" = "power";
  @state() private _period: EnergyPeriod = "today";
  /** the view chosen in the view switch; every view draws the tree until the others exist (P7, P9) */
  @state() private _view: ViewId = "tree";
  /** views offered regardless of the configuration: only for tests, until `options.views` exists (P7) */
  private _testViews?: ViewId[];
  /** energy of the shown period, loaded from the statistics and refreshed while the card is visible */
  private _energyStore = new EnergyStore(
    (q) => this._loadEnergy(q),
    () => {
      this._recompute();
      this.requestUpdate();
    },
    () => !this.classList.contains("offscreen"),
  );

  private _hass?: Hass;
  private _entityIds: string[] = [];
  private _model?: EnergyModel;
  /** second values of the nodes (options.secondary_value), by nodeKey; empty while they are not known */
  private _second = new Map<string, number>();
  private _ro?: ResizeObserver;
  private _io?: IntersectionObserver;
  private _observed?: Element;
  /** the diagram of floors and rooms (the only view for now) */
  private _tree = new TreeView(() => this.requestUpdate());
  /** Config with names from the registry; rebuilt only when the config or the registry changes. */
  private _resolved?: { reg: object; cfg: EnergyCardConfig };
  private _registries = new RegistrySource(() => {
    this._recompute();
    this.requestUpdate();
  });

  static getConfigElement(): HTMLElement {
    return document.createElement("detailed-energy-card-editor");
  }

  static getStubConfig(hass?: StubHass): Record<string, unknown> {
    return buildStubConfig(hass);
  }

  setConfig(config: EnergyCardConfig): void {
    try {
      this._config = validateConfig(config);
      this._error = undefined;
      this._entityIds = collectEntityIds(this._config);
      this._thresholds = resolveThresholds(this._config.colors?.thresholds, this._config.colors?.level_thresholds);
      this._resolved = undefined;
      this._sel = this._loadSelection();
      this._energyStore.clear();
      this._loadMode();
      this._ensureEnergy();
    } catch (e) {
      this._error = (e as Error).message;
      this._config = undefined;
    }
    this._recompute();
  }

  set hass(hass: Hass) {
    const old = this._hass;
    this._hass = hass;
    this._registries.ensure(hass);
    // Only re-render when a referenced entity or the floor / area registry changed.
    const registryChanged = !!old && (old.areas !== hass.areas || old.floors !== hass.floors);
    const displayChanged =
      !!old &&
      (old.locale?.language !== hass.locale?.language ||
        old.language !== hass.language ||
        old.config?.location_name !== hass.config?.location_name);
    if (old && !registryChanged && !displayChanged && this._entityIds.every((id) => old.states[id] === hass.states[id])) return;
    this._recompute();
    this.requestUpdate();
    this._ensureEnergy();
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
    // Pause the line animation while the card is not visible; no re-render needed, only a class on the host.
    if (typeof IntersectionObserver !== "undefined") {
      this._io = new IntersectionObserver((entries) => {
        const last = entries[entries.length - 1];
        if (!last) return;
        this.classList.toggle("offscreen", !last.isIntersecting);
        // the timer chain pauses while the card is hidden: catch up when it is seen again
        if (last.isIntersecting) this._energyStore.refresh();
      });
      this._io.observe(this);
    }
    // re-attached (moved in the edit mode, view change): the refresh stopped when the card was detached
    this._energyStore.refresh();
  }

  disconnectedCallback(): void {
    this._ro?.disconnect();
    this._io?.disconnect();
    this._io = undefined;
    this._tree.stop();
    // an answer that is still on its way is dropped; the last values stay for when the card is back
    this._energyStore.pause();
    this.classList.remove("offscreen");
    this._observed = undefined;
    super.disconnectedCallback();
  }

  protected updated(): void {
    const el = this.renderRoot.querySelector(".scroll");
    if (el && el !== this._observed) {
      this._ro?.disconnect();
      this._ro?.observe(el);
      this._observed = el;
    }
  }

  // ---------- state ----------

  private _recompute(): void {
    if (!this._config || !this._hass) return;
    const states = this._hass.states;
    const reg = this._registries.get(this._hass);
    let cfg = this._config;
    if (reg) {
      if (this._resolved?.reg !== reg) this._resolved = { reg, cfg: resolveNames(this._config, reg) };
      cfg = this._resolved.cfg;
    }
    const names = sourceNames(this._hass.locale?.language ?? this._hass.language);
    const query = this._energyQuery();
    if (query) {
      // while the first answer is on its way everything counts 0 instead of showing warnings; after an error nothing is known
      const values =
        this._energyStore.values(query) ??
        (this._energyStore.status(query) === "error" ? new Map<string, number>() : new Map(query.ids.map((id) => [id, 0] as const)));
      this._model = computeModel(cfg, energyReader(values), socReader(states), names, true);
    } else {
      this._model = computeModel(cfg, powerReader(states), socReader(states), names);
    }
    // the second value: the energy of today in the power mode (once it is loaded), the power now in the energy mode
    const kind = this._secondKind();
    const today = kind === "today" ? this._energyStore.values(this._todayQuery()) : undefined;
    this._second =
      kind === "power"
        ? nodeValues(computeModel(cfg, powerReader(states), socReader(states), names))
        : today
          ? nodeValues(computeModel(cfg, energyReader(today), socReader(states), names, true))
          : new Map();
  }

  private get _storageKey(): string {
    return selectionKey(this._config);
  }

  private _loadSelection(): Selection {
    if (this._config?.options?.remember_selection === false) return {};
    try {
      removeLegacyKeysOnce(localStorage);
      return parseSelection(localStorage.getItem(this._storageKey));
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

  /** Applies the stored selection: the largest floor by default (all floors with focus_selected), all of its rooms unless one is chosen. */
  private _resolve(model: EnergyModel): ResolvedSelection {
    const largest = <T extends { watts: number }>(list: T[]) =>
      list.reduce((best, x, i) => (x.watts > list[best].watts ? i : best), 0);
    let floor: number | undefined;
    let rooms = model.rooms;
    if (model.floors.length) {
      const i = model.floors.findIndex((f) => f.id === this._sel.floor);
      // no single floor selected: all floors count as selected and the room row is hidden;
      // with focus_selected the card starts like this too, so the first level is fully visible
      const byDefault = this._focus ? undefined : largest(model.floors);
      floor = this._sel.floor === null ? undefined : i >= 0 ? i : byDefault;
      rooms = floor === undefined ? [] : model.floors[floor].rooms;
    }
    const r = rooms.findIndex((x) => x.id === this._sel.room);
    const room = r >= 0 ? r : undefined;
    return { floor, rooms, room };
  }

  // ---------- energy mode ----------

  private get _modeKey(): string {
    return `${this._storageKey}:mode`;
  }

  /** Views the view switch offers. */
  private get _views(): ViewId[] {
    return this._testViews ?? offeredViews(undefined, AVAILABLE_VIEWS);
  }

  /** Mode, period and view: the remembered ones, else the configured mode, the first period and the first view offered. */
  private _loadMode(): void {
    const cfg = this._config;
    const periods = offeredPeriods(cfg?.options?.energy_periods);
    const views = this._views;
    let mode: "power" | "energy" = cfg?.options?.mode === "energy" ? "energy" : "power";
    let period: EnergyPeriod = periods[0];
    let view: ViewId = views[0];
    if (cfg?.options?.remember_selection !== false) {
      try {
        const v = parseShown(localStorage.getItem(this._modeKey), periods, views);
        mode = v.mode ?? mode;
        period = v.period ?? period;
        view = v.view ?? view;
      } catch {
        /* storage may be unavailable */
      }
    }
    if (!cfg || !hasEnergy(cfg)) mode = "power";
    this._mode = mode;
    this._period = period;
    this._view = view;
  }

  /** Remembers mode, period and view together, like the selection. */
  private _saveShown(): void {
    if (this._config?.options?.remember_selection === false) return;
    try {
      localStorage.setItem(this._modeKey, JSON.stringify({ mode: this._mode, period: this._period, view: this._view }));
    } catch {
      /* storage may be unavailable */
    }
  }

  private _showView(view: ViewId): void {
    this._view = view;
    this._saveShown();
  }

  private _setView(mode: "power" | "energy", period: EnergyPeriod): void {
    const changed = mode !== this._mode || period !== this._period;
    this._mode = mode;
    this._period = period;
    this._saveShown();
    if (!changed) return;
    // the store drops the numbers of the period that was shown and loads the new one
    this._ensureEnergy();
    this._recompute();
  }

  /** The energy the card shows now: the sensors and the period of the energy mode; undefined in the power mode. */
  private _energyQuery(): EnergyQuery | undefined {
    if (this._mode !== "energy" || !this._config) return undefined;
    return { ids: collectEnergyIds(this._config), period: this._period };
  }

  /** The energy of today, the second value of the power mode. */
  private _todayQuery(): EnergyQuery {
    return { ids: collectEnergyIds(this._config!), period: "today" };
  }

  /**
   * Which second value the nodes show now (options.secondary_value): the energy of today in the power mode
   * (only with energy sensors), the power now in the energy mode; undefined for none.
   */
  private _secondKind(): "today" | "power" | undefined {
    const cfg = this._config;
    const sv = cfg?.options?.secondary_value ?? "none";
    if (!cfg) return undefined;
    if (this._mode === "power") return (sv === "auto" || sv === "today") && hasEnergy(cfg) ? "today" : undefined;
    return sv === "auto" || sv === "power" ? "power" : undefined;
  }

  /** The second line of a node or a consumer, or undefined when it has no second value. */
  private _secondLabel(key: string): string | undefined {
    const v = this._second.get(key);
    if (v === undefined) return undefined;
    const kind = this._secondKind();
    return this._t(kind === "today" ? "second_today" : "second_power").replace("{0}", this._fmtAs(kind === "today" ? "energy" : "power", v));
  }

  /** Tells the store what the card shows; it loads what it does not have yet. */
  private _ensureEnergy(): void {
    if (!this._config || !this._hass) return;
    const query = this._energyQuery();
    // in the power mode the energy of today is loaded for the second value, in the same rhythm
    this._energyStore.want(query ? [query] : this._secondKind() === "today" ? [this._todayQuery()] : []);
  }

  private _loadEnergy(q: EnergyQuery) {
    const hass = this._hass!;
    const { start, end } = periodRange(
      q.period,
      new Date(),
      hass.config?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      firstWeekdayIndex(hass.locale?.first_weekday, hass.locale?.language ?? hass.language),
      q.offset,
    );
    return loadEnergySeries(hass, q.ids, start, end, statPeriodFor(q.period));
  }

  private _renderModeSwitch(cfg: EnergyCardConfig): TemplateResult | typeof nothing {
    if (!hasEnergy(cfg)) return nothing;
    const periods = offeredPeriods(cfg.options?.energy_periods);
    const query = this._energyQuery();
    const status = query ? this._energyStore.status(query) : "idle";
    const items: Array<{ mode: "power" | "energy"; period: EnergyPeriod; label: string; on: boolean }> = [
      { mode: "power", period: this._period, label: this._t("mode_now"), on: this._mode === "power" },
      ...periods.map((p) => ({ mode: "energy" as const, period: p, label: this._t(`period_${p}`), on: this._mode === "energy" && this._period === p })),
    ];
    return html`
      <div class="modes" role="group" aria-label=${this._t("period_label")}>
        ${items.map(
          (i) => html`<button class=${i.on ? "on" : ""} aria-pressed=${i.on} @click=${() => this._setView(i.mode, i.period)}>${i.label}</button>`,
        )}
        ${status === "loading" ? html`<span class="status">${this._t("energy_loading")}</span>` : nothing}
        ${status === "error" ? html`<span class="status warn">${this._t("energy_error")}</span>` : nothing}
      </div>
    `;
  }

  /** Mode switch and, with two views or more, the view switch to its right. */
  private _renderSwitches(cfg: EnergyCardConfig): TemplateResult | typeof nothing {
    const modes = this._renderModeSwitch(cfg);
    const views = this._views;
    if (views.length < 2) return modes;
    return html`
      <div class="switches">
        ${modes}
        <div class="views" role="group" aria-label=${this._t("view_label")}>
          ${views.map((v) => {
            const on = v === this._view;
            const label = this._t(`view_${v}`);
            return html`<button class=${on ? "on" : ""} aria-pressed=${on} title=${label} aria-label=${label} @click=${() => this._showView(v)}>
              <ha-icon icon=${VIEW_ICONS[v]}></ha-icon>
            </button>`;
          })}
        </div>
      </div>
    `;
  }

  // ---------- helpers ----------

  private _t(key: Key): string {
    return localize(this._hass?.locale?.language ?? this._hass?.language, key);
  }

  private _fmt(watts: number): string {
    return this._fmtAs(this._mode, watts);
  }

  /** Watts as power, or watt hours as energy, with the decimals and the unit of the options. */
  private _fmtAs(kind: "power" | "energy", value: number): string {
    const o = this._config?.options;
    const lang = this._hass?.locale?.language ?? this._hass?.language;
    if (kind === "energy") return formatEnergy(value, o?.decimals ?? 1, lang);
    return formatPower(value, o?.unit ?? "W", o?.decimals ?? 2, lang);
  }

  private _thresholds = resolveThresholds(undefined, undefined);

  private get _focus(): boolean {
    return this._config?.options?.focus_selected === true;
  }

  private _moreInfo(entityId: string): void {
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }

  // ---------- render ----------

  /** Everything the tree view needs for this frame. */
  private _treeContext(cfg: EnergyCardConfig, model: EnergyModel, sel: ResolvedSelection, home: string): TreeContext {
    return {
      config: cfg,
      model,
      sel,
      stored: this._sel,
      width: this._width,
      energy: this._mode === "energy",
      focus: this._focus,
      thresholds: this._thresholds,
      home,
      fmt: (w) => this._fmt(w),
      secondary: this._secondKind() !== undefined,
      second: (key) => this._secondLabel(key),
      t: (k) => this._t(k),
      select: (s) => this._select(s),
      moreInfo: (id) => this._moreInfo(id),
    };
  }

  private get _homeName(): string {
    return this._hass?.config?.location_name ?? this._t("home");
  }

  /** Positions of the diagram, before every render: `render()` only reads them. */
  protected willUpdate(): void {
    const model = this._model;
    if (this._error || !this._config || !model) {
      this._tree.reset();
      return;
    }
    this._tree.prepare(this._treeContext(this._config, model, this._resolve(model), this._homeName));
  }

  protected render(): TemplateResult {
    if (this._error) return html`<ha-card><div class="error">${this._error}</div></ha-card>`;
    const cfg = this._config;
    const model = this._model;
    if (!cfg || !model || !this._tree.ready) return html`<ha-card></ha-card>`;

    const sel = this._resolve(model);
    const floor = sel.floor !== undefined ? model.floors[sel.floor] : undefined;
    const room = sel.room !== undefined ? sel.rooms[sel.room] : undefined;
    const home = this._homeName;
    const allFloors = model.floors.length > 0 && sel.floor === undefined;
    // No single room selected: all rooms of the visible row count as selected.
    const allRooms = sel.rooms.length > 0 && !room;
    const detailRoom: RoomNode | undefined = allFloors
      ? {
          id: "",
          name: home,
          icon: "mdi:home",
          watts: model.floors.reduce((sum, f) => sum + f.watts, 0),
          consumers: model.floors.flatMap((f) => f.rooms.flatMap((r) => r.consumers)),
        }
      : allRooms
      ? {
          id: floor?.id ?? "",
          name: floor?.name ?? home,
          icon: floor?.icon ?? "mdi:home",
          color: floor?.color,
          // a floor with its own meter shows the metered value, like its node
          watts: floor ? floor.watts : sel.rooms.reduce((sum, r) => sum + r.watts, 0),
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
          ${this._renderBadges(cfg, model)}
        </header>
        ${this._renderSwitches(cfg)}
        ${this._tree.render(this._treeContext(cfg, model, sel, home))}
        ${this._config?.options?.show_consumers === false ? nothing : this._renderDetail(detailRoom, listRemainder(model, allRooms ? floor : undefined, room))}
      </ha-card>
    `;
  }

  /** Self-sufficiency and self-consumption, each only when it can be computed; they wrap on narrow cards. */
  private _renderBadges(cfg: EnergyCardConfig, model: EnergyModel): TemplateResult | typeof nothing {
    const own = cfg.options?.show_self_consumption !== false ? model.selfConsumption : null;
    if (model.autarky === null && own === null) return nothing;
    return html`<div class="badges">
      ${model.autarky !== null ? html`<div class="badge">${this._t("autarky")} ${Math.round(model.autarky * 100)} %</div>` : nothing}
      ${own !== null ? html`<div class="badge self">${this._t("self_consumption")} ${Math.round(own * 100)} %</div>` : nothing}
    </div>`;
  }

  /** The "Unassigned" row of the list, or the warning that the children measure more than the meter. */
  private _renderRemainder(r: Remainder | undefined, second: boolean): TemplateResult | typeof nothing {
    if (!r || this._config?.options?.show_unassigned === false) return nothing;
    if (r.excess !== undefined) {
      const text = this._t(r.scope === "floor" ? "excess_rooms" : "excess_consumers").replace("{0}", this._fmt(r.excess));
      return html`<div class="row excess" style="cursor:default">
        <span class="name"><ha-icon icon=${"mdi:alert-outline"}></ha-icon> ${text}</span><span class="spacer"></span><span class="val"></span>${second ? html`<span></span>` : nothing}
      </div>`;
    }
    if (r.value < 1) return nothing;
    const name = r.scope === "home" ? this._t("unassigned") : this._t("unassigned_in").replace("{0}", r.name ?? "");
    return html`<div class="row" style="cursor:default">
      <span class="name">${name}</span><span class="spacer"></span>
      <span class="val">${this._fmt(r.value)}</span>${second ? html`<span></span>` : nothing}
    </div>`;
  }

  private _renderDetail(room: RoomNode | undefined, remainder: Remainder | undefined): TemplateResult {
    if (!room) {
      return html`<div class="detail empty">${this._t("no_rooms")}</div>`;
    }
    const onlyActive = this._config?.options?.only_active_consumers === true;
    const sorted = [...listedConsumers(room.consumers, onlyActive)].sort((a, b) => b.watts - a.watts);
    const max = Math.max(1, ...sorted.map((c) => c.watts));
    const thresholds = this._thresholds;
    const second = this._secondKind() !== undefined;
    return html`
      <div class="detail">
        <div class="detail-head">
          <span><ha-icon icon=${room.icon ?? "mdi:door"}></ha-icon> <b>${room.name}</b>
            <span class="muted"> · ${this._fmt(room.watts)}</span></span>
          <span class="muted">${onlyActive ? `${sorted.length} / ${room.consumers.length}` : room.consumers.length} ${this._t("consumers")}</span>
        </div>
        ${sorted.length === 0 && !(room.consumers.length === 0 && room.meter?.metered)
          ? html`<div class="empty">${this._t(room.consumers.length === 0 ? "no_consumers" : "no_active_consumers")}</div>`
          : nothing}
        <div class="list ${second ? "second" : ""}">
        ${sorted.map((c) => {
          const name = c.name ?? this._hass?.states[c.entity]?.attributes.friendly_name ?? c.entity;
          const list = elementThresholds(c.thresholds, thresholds.consumer);
          const barColor = this._mode === "energy" ? undefined : thresholdColor(list, c.watts);
          const level = barColor ? Math.min(thresholdLevel(list, c.watts), MAX_LEVEL) : 0;
          const barWidth = barColor ? thresholdWidth(list, c.watts) : undefined;
          return html`
            <button class="row ${c.valid ? "" : "warn"} ${c.valid && isIdle(c.watts) ? "idle" : ""}" @click=${() => this._moreInfo(c.entity)}>
              <span class="name">${name}<small>${c.noEnergy ? this._t("no_energy") : c.entity}</small></span>
              <span class="bar" style=${styleMap({ "--level": String(level), ...(barWidth !== undefined ? { "--bar-h": `${barWidth}px` } : {}) })}><div style=${styleMap({ width: `${(c.watts / max) * 100}%`, background: barColor })}></div></span>
              <span class="val">${c.valid ? this._fmt(c.watts) : "–"}</span>
              ${second ? html`<span class="val2">${this._secondLabel(nodeKey.consumer(c.entity)) ?? ""}</span>` : nothing}
            </button>
          `;
        })}
        ${this._renderRemainder(remainder, second)}
        </div>
      </div>
    `;
  }
}

declare global {
  interface Window {
    customCards?: Array<Record<string, unknown>>;
  }
}
logBannerOnce(__VERSION__, window as Window & BannerTarget);
defineOnce("detailed-energy-card", DetailedEnergyCard);
window.customCards ??= [];
registerCardOnce(window.customCards, {
  type: "detailed-energy-card",
  name: "Detailed Energy Card",
  description: localize(typeof navigator === "undefined" ? undefined : navigator.language, "picker_description"),
  preview: true,
});
