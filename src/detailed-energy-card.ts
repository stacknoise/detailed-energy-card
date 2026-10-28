import { LitElement, html, nothing, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { styleMap } from "lit/directives/style-map.js";
import { cardStyles, colorVars } from "./styles/theme";
import { collectEnergyIds, collectEntityIds, hasEnergy, hasPrice, validateConfig, type EnergyCardConfig } from "./model/config";
import { runAction, type ActionConfig, type ActionDeps, type NodeActions } from "./model/actions";
import { periodLabel } from "./model/browse";
import { BASE_LOAD_NIGHTS, STANDBY_HOURS, baseLoad, homePowerIds, homePowerRows, runsContinuously } from "./model/standby";
import { computeCosts, type CostResult } from "./model/costs";
import { energyReader, firstWeekdayIndex, loadStatSeries, localTime, offeredPeriods, periodRange, statPeriodFor, type EnergyPeriod } from "./model/energy";
import { EnergyStore, type EnergyQuery } from "./model/energy-store";
import { computeModel, listRemainder, listedConsumers, nodeKey, nodeValues, type ConsumerNode, type EnergyModel, type Remainder, type RoomNode } from "./model/compute";
import { formatEnergy, formatPower, type StateLike } from "./model/units";
import { powerReader, socReader } from "./model/readers";
import { elementThresholds, isIdle, resolveThresholds, thresholdColor, thresholdLevel, thresholdWidth } from "./model/thresholds";
import { localize, sourceNames, type Key } from "./localize";
import { buildStubConfig, type StubHass } from "./model/stub-config";
import "./editor/card-editor";
import "./heatmap-card";
import { defineOnce, logBannerOnce, registerCardOnce, type BannerTarget } from "./register";
import { RegistrySource, resolveNames, type AreaEntry, type FloorEntry } from "./model/registry";
import { Gesture } from "./view/gesture";
import { MAX_LEVEL, TreeView, type ActionBinding, type ResolvedSelection, type TreeContext } from "./view/tree";
import { SankeyView, type SankeyContext } from "./view/sankey";
import { buildSankey, type SankeyGraphNode } from "./model/sankey";
import { renderTimeline, type TimelineContext, type TimelineKpi, type TimelineStack } from "./view/timeline";
import {
  bucketStarts,
  bucketUnitFor,
  compareWithPrevious,
  comparisonDayBack,
  peakIndex,
  periodBounds,
  treeSeries,
  type TimelineSeries,
} from "./model/timeline";
import { AVAILABLE_VIEWS, VIEW_ICONS, offeredViews, parseShown, type ViewId } from "./view/views";
import { parseSelection, removeLegacyKeysOnce, selectionKey, type Selection } from "./model/selection";
interface Hass {
  language?: string;
  locale?: { language?: string; first_weekday?: string };
  config?: { location_name?: string; time_zone?: string; currency?: string };
  areas?: Record<string, AreaEntry | undefined>;
  floors?: Record<string, FloorEntry | undefined>;
  callWS<T>(msg: Record<string, unknown>): Promise<T>;
  callService?(domain: string, service: string, data?: Record<string, unknown>, target?: Record<string, unknown>): Promise<unknown>;
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
  /** periods back from the running one (0, -1 = the one before, ...); only in the energy mode, not remembered */
  @state() private _offset = 0;
  /** the view chosen in the view switch */
  @state() private _view: ViewId = "tree";
  /** energy of the shown period, loaded from the statistics and refreshed while the card is visible */
  private _energyStore = new EnergyStore(
    (q, since) => this._loadEnergy(q, since),
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
  /** costs of the shown period (power mode: today), with the amounts of the cost statistics of Home Assistant */
  private _costs?: { result: CostResult; ha?: number; haFeedIn?: number };
  private _ro?: ResizeObserver;
  private _io?: IntersectionObserver;
  private _observed?: Element;
  /** the diagram of floors and rooms */
  private _tree = new TreeView(() => this.requestUpdate());
  private _sankey = new SankeyView(() => this.requestUpdate());
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
      this._gestures.clear();
      this._sel = this._loadSelection();
      this._energyStore.clear();
      this._offset = 0;
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

  /** options.compact: only the diagram, in smaller circles */
  private get _compact(): boolean {
    return this._config?.options?.compact === true;
  }

  getCardSize(): number {
    return this._compact ? 4 : 8;
  }

  getGridOptions() {
    return this._compact ? { columns: 12, rows: "auto", min_columns: 4 } : { columns: 12, rows: "auto", min_columns: 6 };
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
    this._costs = this._computeCosts();
    this._second =
      kind === "power"
        ? nodeValues(computeModel(cfg, powerReader(states), socReader(states), names))
        : kind === "cost"
          ? (this._costs?.result.nodes ?? new Map())
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
    // the compact view has no selection: all floors, no room row (without floors the rooms are the row)
    if (this._compact) return { floor: undefined, rooms: model.floors.length ? [] : model.rooms, room: undefined };
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
    const o = this._config?.options;
    return offeredViews(o?.view, o?.views, !!this._config && hasEnergy(this._config), AVAILABLE_VIEWS);
  }

  /** Mode, period and view: the remembered ones, else the configured mode, the first period and the first view offered. */
  private _loadMode(): void {
    const cfg = this._config;
    const periods = offeredPeriods(cfg?.options?.energy_periods);
    const views = this._views;
    let mode: "power" | "energy" = cfg?.options?.mode === "energy" ? "energy" : "power";
    let period: EnergyPeriod = periods[0];
    const configured = this._config?.options?.view;
    let view: ViewId = views.includes(configured as ViewId) ? (configured as ViewId) : views[0];
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
    this._ensureEnergy();
  }

  private _setView(mode: "power" | "energy", period: EnergyPeriod): void {
    const changed = mode !== this._mode || period !== this._period;
    this._mode = mode;
    this._period = period;
    this._saveShown();
    if (!changed) return;
    // another period or the mode Now starts at the running period again
    this._offset = 0;
    // the store drops the numbers of the period that was shown and loads the new one
    this._ensureEnergy();
    this._recompute();
  }

  /** The offset that counts: browsing only exists in the energy mode. */
  private get _off(): number {
    return this._mode === "energy" ? this._offset : 0;
  }

  /** Browses the shown period back (-1) or forward (+1), never beyond the running one. */
  private _browse(step: number): void {
    const next = Math.min(0, this._offset + step);
    if (next === this._offset) return;
    this._offset = next;
    this._ensureEnergy();
    this._recompute();
  }

  /** The energy the card shows now: the sensors and the period of the energy mode; undefined in the power mode. */
  private _energyQuery(): EnergyQuery | undefined {
    if (this._mode !== "energy" || !this._config) return undefined;
    return { ids: collectEnergyIds(this._config), period: this._period, offset: this._off || undefined };
  }

  /** The energy of today, the second value of the power mode. */
  private _todayQuery(): EnergyQuery {
    return { ids: collectEnergyIds(this._config!), period: "today" };
  }

  /**
   * Which second value the nodes show now (options.secondary_value): the energy of today in the power mode
   * (only with energy sensors), the power now in the energy mode; undefined for none.
   */
  private _secondKind(): "today" | "power" | "cost" | undefined {
    const cfg = this._config;
    const sv = cfg?.options?.secondary_value ?? "none";
    if (!cfg) return undefined;
    // the costs of the shown period, in the power mode of today
    if (sv === "cost") return this._costsOn ? "cost" : undefined;
    if (this._mode === "power") return (sv === "auto" || sv === "today") && hasEnergy(cfg) ? "today" : undefined;
    return sv === "auto" || sv === "power" ? "power" : undefined;
  }

  /** The second line of a node or a consumer, or undefined when it has no second value. */
  private _secondLabel(key: string): string | undefined {
    const v = this._second.get(key);
    if (v === undefined) return undefined;
    const kind = this._secondKind();
    if (kind === "cost") return this._money(v);
    return this._t(kind === "today" ? "second_today" : "second_power").replace("{0}", this._fmtAs(kind === "today" ? "energy" : "power", v));
  }

  /** Tooltip of a second line with costs: "2,1 kWh, davon 0,6 kWh aus dem Netz, 0,18 €". */
  private _secondTitle(key: string): string | undefined {
    const r = this._costs?.result;
    if (this._secondKind() !== "cost" || !r || !r.nodes.has(key)) return undefined;
    const energy = r.energy.get(key);
    if (energy === undefined) return this._money(r.nodes.get(key)!);
    return this._t("cost_tip")
      .replace("{0}", this._fmtAs("energy", energy))
      .replace("{1}", this._fmtAs("energy", r.fromGrid.get(key) ?? 0))
      .replace("{2}", this._money(r.nodes.get(key)!));
  }

  // ---------- costs ----------

  /** The costs can be shown: a price and an energy counter on the grid. */
  private get _costsOn(): boolean {
    const cfg = this._config;
    return !!cfg && hasPrice(cfg) && (cfg.sources ?? []).some((s) => s.type === "grid" && !!s.energy_entity);
  }

  /** The period of the costs: the one of the energy mode, today in the power mode. */
  private get _costPeriod(): EnergyPeriod {
    return this._mode === "energy" ? this._period : "today";
  }

  /** The cost statistics Home Assistant keeps for the grid in the Energy dashboard, when they exist. */
  private _haCostIds(): { cost?: string; feedIn?: string } {
    const grid = (this._config?.sources ?? []).find((s) => s.type === "grid" && s.energy_entity);
    const has = (id: string | undefined) => (id && this._hass?.states[id] ? id : undefined);
    return {
      cost: has(grid?.energy_entity && `${grid.energy_entity}_cost`),
      feedIn: has(grid?.energy_entity_return && `${grid.energy_entity_return}_compensation`),
    };
  }

  /** Hourly energy and prices of the cost period (loaded incrementally) and the cost statistics of Home Assistant. */
  private _costQueries(): EnergyQuery[] {
    if (!this._costsOn) return [];
    const cfg = this._config!;
    const period = this._costPeriod;
    const offset = this._off || undefined;
    const out: EnergyQuery[] = [{ ids: collectEnergyIds(cfg), period, offset, stat: "hour", incremental: true }];
    const prices = [cfg.options?.price_entity, cfg.options?.feed_in_price_entity].filter((e): e is string => !!e);
    if (prices.length) out.push({ ids: prices, period, offset, stat: "hour", kind: "mean", incremental: true });
    const ha = Object.values(this._haCostIds()).filter((e): e is string => !!e);
    if (ha.length) out.push({ ids: ha, period, offset, kind: "change" });
    return out;
  }

  private _computeCosts(): { result: CostResult; ha?: number; haFeedIn?: number } | undefined {
    if (!this._costsOn || !this._hass) return undefined;
    const cfg = this._config!;
    const o = cfg.options ?? {};
    const queries = this._costQueries();
    const rows = this._energyStore.series(queries[0]);
    if (!rows) return undefined;
    const priceQ = queries.find((q) => q.kind === "mean");
    const haQ = queries.find((q) => q.kind === "change");
    const priceRows = priceQ ? this._energyStore.series(priceQ) : undefined;
    const now = new Date();
    const b = periodBounds(this._costPeriod, now, this._timeZone, this._firstWeekday, this._off);
    const result = computeCosts({
      cfg,
      rows,
      starts: bucketStarts(b.start, b.end, "hour", this._timeZone),
      end: b.end.getTime(),
      until: this._off < 0 ? b.end.getTime() : now.getTime(),
      price: o.price !== undefined ? { fixed: o.price } : { rows: o.price_entity ? priceRows?.get(o.price_entity) : undefined },
      feedInPrice:
        o.feed_in_price !== undefined
          ? { fixed: o.feed_in_price }
          : o.feed_in_price_entity
            ? { rows: priceRows?.get(o.feed_in_price_entity) }
            : undefined,
    });
    if (!result) return undefined;
    const ids = this._haCostIds();
    const ha = haQ ? this._energyStore.values(haQ) : undefined;
    return { result, ha: ids.cost ? ha?.get(ids.cost) : undefined, haFeedIn: ids.feedIn ? ha?.get(ids.feedIn) : undefined };
  }

  /** An amount in the currency of the options, else the one of Home Assistant. */
  private _money(v: number): string {
    const currency = this._config?.options?.currency ?? this._hass?.config?.currency ?? "EUR";
    try {
      return new Intl.NumberFormat(this._hass?.locale?.language ?? this._hass?.language, { style: "currency", currency }).format(v);
    } catch {
      return `${v.toFixed(2)} ${currency}`;
    }
  }

  /** Tells the store what the card shows; it loads what it does not have yet. */
  private _ensureEnergy(): void {
    if (!this._config || !this._hass) return;
    const query = this._energyQuery();
    // in the power mode the energy of today is loaded for the second value, in the same rhythm
    const wanted = query ? [query] : this._secondKind() === "today" ? [this._todayQuery()] : [];
    // the timeline also needs the previous period and, for a week or a month, the day today is compared with
    if (this._showsTimeline) wanted.push(...this._timelineQueries());
    // the costs need the hours of their period and the prices
    wanted.push(...this._costQueries());
    // base load and standby look at the hourly means of power sensors
    wanted.push(...this._powerStatQueries());
    this._energyStore.want(wanted);
  }

  // ---------- base load and standby ----------

  /** Hourly means of the home (the last 7 nights) and of the consumers (the last day), each only when its option is on. */
  private _powerStatQueries(): EnergyQuery[] {
    const cfg = this._config;
    if (!cfg) return [];
    const out: EnergyQuery[] = [];
    const home = homePowerIds(cfg);
    if (cfg.options?.show_base_load === true && home.length) {
      out.push({ ids: home, period: "today", hours: BASE_LOAD_NIGHTS * 24, stat: "hour", kind: "mean" });
    }
    const consumers = this._consumerIds();
    if ((cfg.options?.standby_watts ?? 0) > 0 && consumers.length) {
      out.push({ ids: consumers, period: "today", hours: STANDBY_HOURS, stat: "hour", kind: "mean" });
    }
    return out;
  }

  /** The name of a consumer: its own, the friendly name of its sensor, or a stand-in while it has no sensor yet. */
  private _consumerName(c: ConsumerNode): string {
    if (c.name) return c.name;
    if (c.noSensor) return this._t("consumer_unnamed");
    return String(this._hass?.states[c.entity]?.attributes.friendly_name ?? c.entity);
  }

  private _consumerIds(): string[] {
    const cfg = this._config;
    const rooms = [...(cfg?.rooms ?? []), ...(cfg?.floors ?? []).flatMap((f) => f.rooms ?? [])];
    const all = [...rooms.flatMap((r) => r.consumers ?? []), ...(cfg?.consumers ?? [])];
    return [...new Set(all.flatMap((c) => (c.entity ? [c.entity] : [])))];
  }

  /** The base load in watts, undefined while it is not known (not asked for, no statistics yet, no night in them). */
  private _baseLoad(): number | undefined {
    const cfg = this._config;
    const q = this._powerStatQueries().find((x) => x.hours === BASE_LOAD_NIGHTS * 24);
    const series = q ? this._energyStore.series(q) : undefined;
    return cfg && series ? baseLoad(homePowerRows(cfg, series), this._timeZone) : undefined;
  }

  /** Consumers that run all the time: no hourly mean of the last day below `options.standby_watts`. */
  private _standby(): Set<string> {
    const watts = this._config?.options?.standby_watts ?? 0;
    const q = this._powerStatQueries().find((x) => x.hours === STANDBY_HOURS);
    const series = q ? this._energyStore.series(q) : undefined;
    if (!series || watts <= 0) return new Set();
    return new Set([...series].filter(([, rows]) => runsContinuously(rows, watts)).map(([id]) => id));
  }

  private get _timeZone(): string {
    return this._hass?.config?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  private get _firstWeekday(): number {
    const hass = this._hass;
    return firstWeekdayIndex(hass?.locale?.first_weekday, hass?.locale?.language ?? hass?.language);
  }

  /** Loads a query; a refresh of an incremental query only from `since` on, unless a new period has begun. */
  private async _loadEnergy(q: EnergyQuery, since?: number) {
    // a rolling window ends now and starts at a full hour; a period is a day, a week or a month
    const now = new Date();
    const { start, end } = q.hours
      ? { start: new Date(Math.floor((now.getTime() - q.hours * 3_600_000) / 3_600_000) * 3_600_000), end: now }
      : periodRange(q.period, now, this._timeZone, this._firstWeekday, q.offset);
    const from = since !== undefined && since >= start.getTime() ? since : undefined;
    const series = await loadStatSeries(this._hass!, q.ids, from !== undefined ? new Date(from) : start, end, q.stat ?? statPeriodFor(q.period), q.kind);
    return { series, since: from };
  }

  // ---------- sankey ----------

  private get _showsSankey(): boolean {
    return !this._compact && this._view === "sankey" && this._views.includes("sankey");
  }

  /** The diagram of this frame: the selection decides which rooms and consumers are drawn. */
  private _sankeyContext(model: EnergyModel, sel: ResolvedSelection): SankeyContext {
    const energy = this._mode === "energy";
    // the same selection as the path and the list: the largest floor until a floor is chosen
    const floor = sel.floor !== undefined ? model.floors[sel.floor] : undefined;
    const room = sel.room !== undefined ? sel.rooms[sel.room] : undefined;
    const graph = buildSankey({
      model,
      floorId: floor?.id,
      roomId: room?.id,
      showUnassigned: this._config?.options?.show_unassigned !== false,
      energy,
      text: {
        unassigned: this._t("unassigned"),
        unassignedIn: (name) => this._t("unassigned_in").replace("{0}", name),
        feedIn: this._t("sankey_feed_in"),
        charge: this._t("sankey_charge"),
        consumer: (c) => this._consumerName(c),
      },
    });
    const selected = new Set<string>();
    if (floor) selected.add(`f:${floor.id}`);
    if (room) selected.add(`r:${room.id}`);
    return {
      width: this._width || 320,
      graph,
      selected,
      fmt: (v) => this._fmt(v),
      splitNote: this._t("sankey_split"),
      empty: this._t("sankey_empty"),
      click: (n) => this._sankeyClick(n, floor?.id, room?.id),
      clickable: (n) => ["source", "consumer", "floor", "room"].includes(n.ref.kind),
      animate: !energy && this._config?.options?.animation !== false,
    };
  }

  /** Floors and rooms are selected (a second click clears the selection again); sources and consumers open their dialog. */
  private _sankeyClick(n: SankeyGraphNode, floorId?: string, roomId?: string): void {
    const ref = n.ref;
    if (ref.kind === "source" || ref.kind === "consumer") this._moreInfo(ref.entity);
    else if (ref.kind === "floor") this._select(floorId === ref.id ? { floor: null } : { floor: ref.id });
    else if (ref.kind === "room") {
      const floor = ref.floor ?? floorId;
      this._select(roomId === ref.id ? { floor, room: null } : { floor, room: ref.id });
    }
  }

  // ---------- timeline ----------

  /** The timeline is chosen and offered (it needs an energy sensor). */
  private get _showsTimeline(): boolean {
    return !this._compact && this._view === "timeline" && this._views.includes("timeline");
  }

  /** The period of the timeline: the one of the energy mode, "today" in the power mode (the timeline has no live value). */
  private get _timelinePeriod(): EnergyPeriod {
    return this._mode === "energy" ? this._period : "today";
  }

  /** Running and previous period; a week or a month also the hours of the day today is compared with. */
  private _timelineQueries(): EnergyQuery[] {
    const ids = collectEnergyIds(this._config!);
    const period = this._timelinePeriod;
    const o = this._off;
    const out: EnergyQuery[] = [
      { ids, period, offset: o || undefined },
      { ids, period, offset: o - 1 },
    ];
    // a period that is over is compared as a whole, only the running one needs the hours of the day
    if (period !== "today" && o === 0) out.push({ ids, period: "today", offset: -comparisonDayBack(period, new Date(), this._timeZone) });
    return out;
  }

  /** Values per bar of a period, or undefined while its rows are not there. */
  private _series(q: EnergyQuery, starts: number[], end: number): TimelineSeries | undefined {
    const rows = this._energyStore.series(q);
    return rows ? treeSeries(this._config!, rows, starts, end) : undefined;
  }

  private _timelineContext(model: EnergyModel, sel: ResolvedSelection): TimelineContext {
    const cfg = this._config!;
    const tz = this._timeZone;
    const fw = this._firstWeekday;
    const lang = this._hass?.locale?.language ?? this._hass?.language;
    const now = new Date();
    const period = this._timelinePeriod;
    const unit = bucketUnitFor(period);
    const [q, qPrev, qDay] = this._timelineQueries();
    const o = this._off;
    const cur = periodBounds(period, now, tz, fw, o);
    const prev = periodBounds(period, now, tz, fw, o - 1);
    const starts = bucketStarts(cur.start, cur.end, unit, tz);
    const prevStarts = bucketStarts(prev.start, prev.end, unit, tz);
    const series = this._series(q, starts, cur.end.getTime());
    const prevSeries = this._series(qPrev, prevStarts, prev.end.getTime());
    const zeros = starts.map(() => 0);

    // the stack follows the selection: the floors of the home, the rooms of a floor, the consumers of a room
    const floor = sel.floor !== undefined ? model.floors[sel.floor] : undefined;
    const room = sel.room !== undefined ? sel.rooms[sel.room] : undefined;
    const floors = model.floors.length > 0;
    let stacks: TimelineStack[];
    let shown: (s: TimelineSeries | undefined) => number[] | undefined;
    if (room) {
      stacks = room.consumers.flatMap((c) => {
        if (c.noSensor) return [];
        const v = series?.consumers.get(c.entity);
        if (!v && series) return [];
        const name = this._consumerName(c);
        return [{ id: c.entity, name: String(name), values: v ?? zeros, pick: () => this._moreInfo(c.entity) }];
      });
      shown = (s) => s?.rooms.get(room.id);
    } else if (floor) {
      stacks = floor.rooms.flatMap((r) => {
        const v = series?.rooms.get(r.id);
        if (!v && series) return [];
        return [{ id: r.id, name: r.name, color: r.color, values: v ?? zeros, pick: () => this._select({ ...this._sel, room: r.id }) }];
      });
      shown = (s) => s?.floors.get(floor.id);
    } else {
      const children = floors ? model.floors : model.rooms;
      stacks = children.flatMap((n) => {
        const v = floors ? series?.floors.get(n.id) : series?.rooms.get(n.id);
        if (!v && series) return [];
        const pick = floors ? () => this._select({ floor: n.id }) : () => this._select({ room: n.id });
        return [{ id: n.id, name: n.name, color: n.color, values: v ?? zeros, pick }];
      });
      // consumers directly under the home are part of the stack of the home
      for (const c of model.consumers) {
        if (c.noSensor) continue;
        const v = series?.consumers.get(c.entity);
        if (!v && series) continue;
        const name = this._consumerName(c);
        stacks.push({ id: c.entity, name: String(name), values: v ?? zeros, pick: () => this._moreInfo(c.entity) });
      }
      shown = (s) => s?.home;
    }

    const hourOf = (t: number) => localTime(new Date(t), tz).hour;
    const two = (h: number) => String(h).padStart(2, "0");
    const dayName = (t: number) => new Intl.DateTimeFormat(lang, { weekday: "short", timeZone: tz }).format(new Date(t));
    const dayNum = (t: number) => new Intl.DateTimeFormat(lang, { day: "numeric", timeZone: tz }).format(new Date(t));
    const barTime = (i: number) =>
      unit === "hour" ? this._t("tl_hour").replace("{0}", two(hourOf(starts[i]))).replace("{1}", two((hourOf(starts[i]) + 1) % 24)) : `${dayName(starts[i])} ${dayNum(starts[i])}.`;

    const kpis: TimelineKpi[] = [];
    const values = shown(series);
    // a period that is over counts up to its end
    const nowMs = o < 0 ? cur.end.getTime() : now.getTime();
    const fullHour = two(localTime(new Date(nowMs - (nowMs - cur.start.getTime()) % 3_600_000), tz).hour);
    if (values) {
      const dayRows = qDay ? this._energyStore.series(qDay) : undefined;
      const day = qDay ? periodBounds("today", now, tz, fw, qDay.offset) : undefined;
      const dayStarts = day ? bucketStarts(day.start, day.end, "hour", tz) : undefined;
      const daySeries = dayRows && dayStarts && day ? treeSeries(cfg, dayRows, dayStarts, day.end.getTime()) : undefined;
      const prevValues = shown(prevSeries);
      const cmp = compareWithPrevious({
        unit,
        now: nowMs,
        whole: o < 0,
        starts,
        values,
        prevStarts,
        prevValues: prevValues ?? prevStarts.map(() => 0),
        dayStarts,
        dayValues: shown(daySeries),
      });
      const before = this._t(period === "today" ? "tl_before_today" : period === "week" ? "tl_before_week" : "tl_before_month");
      const totalLabel = o < 0 ? this._t("tl_total") : period === "today" ? this._t("tl_until").replace("{0}", fullHour) : this._t(period === "week" ? "tl_week" : "tl_month");
      kpis.push({ value: this._fmtAs("energy", cmp.current), label: totalLabel });
      if (prevValues && cmp.change !== null && (period === "today" || o < 0 || dayRows)) {
        const pct = Math.round(cmp.change * 100);
        const vs = o < 0 ? this._t("tl_vs").replace("{0}", before) : period === "today" ? this._t("tl_vs_day").replace("{0}", fullHour) : this._t(period === "week" ? "tl_vs_week" : "tl_vs_month");
        kpis.push({ value: `${pct > 0 ? "+" : pct < 0 ? "−" : "±"}${Math.abs(pct)} %`, label: vs, tone: pct > 0 ? "up" : pct < 0 ? "down" : undefined });
      }
      const peak = peakIndex(values);
      if (peak >= 0) kpis.push({ value: this._fmtAs("energy", values[peak]), label: this._t("tl_peak").replace("{0}", barTime(peak)) });
    }

    const prevKey = o < 0 ? (period === "today" ? "tl_before_today" : period === "week" ? "tl_before_week" : "tl_before_month") : period === "today" ? "tl_prev_today" : period === "week" ? "tl_prev_week" : "tl_prev_month";
    const nowIndex = o < 0 ? -1 : starts.findIndex((t, i) => nowMs >= t && nowMs < (starts[i + 1] ?? cur.end.getTime()));
    const axisNumber = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
    return {
      width: this._width || 320,
      stacks,
      previous: shown(prevSeries),
      previousLabel: this._t(prevKey),
      kpis,
      axisLabel: (i) =>
        unit === "hour"
          ? hourOf(starts[i]) % 6 === 0 && (i === 0 || hourOf(starts[i - 1]) !== hourOf(starts[i]))
            ? two(hourOf(starts[i]))
            : undefined
          : period === "week"
            ? dayName(starts[i])
            : i % 7 === 0
              ? dayNum(starts[i])
              : undefined,
      barTitle: (i, st, v) => `${barTime(i)} · ${st.name} ${this._fmtAs("energy", v)}`,
      axisValue: (wh) => axisNumber.format(wh / 1000),
      nowIndex,
      nowLabel: this._t("tl_now"),
      loading: series ? undefined : this._t("energy_loading"),
    };
  }

  /** The path of the head; in the timeline its parts select the home or the floor again (there are no nodes to click). */
  private _renderPath(model: EnergyModel, home: string, floor?: { id: string; name: string }, room?: { name: string }): TemplateResult {
    if (!this._showsTimeline) return html`${[home, floor?.name, room?.name].filter(Boolean).join(" › ")}`;
    const toHome = () => this._select(model.floors.length ? { floor: null } : { room: null });
    return html`<button class="crumb" @click=${toHome}>${home}</button>${floor
        ? html` › <button class="crumb" @click=${() => this._select({ floor: floor.id })}>${floor.name}</button>`
        : nothing}${room ? html` › <span>${room.name}</span>` : nothing}`;
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
        ${this._mode === "energy" ? this._renderBrowse() : nothing}
        ${status === "loading" ? html`<span class="status">${this._t("energy_loading")}</span>` : nothing}
        ${status === "error" ? html`<span class="status warn">${this._t("energy_error")}</span>` : nothing}
      </div>
    `;
  }

  /** Arrows to browse back through the periods and the name of the period shown when it is not the running one. */
  private _renderBrowse(): TemplateResult {
    const label = periodLabel(this._period, this._offset, new Date(), this._timeZone, this._firstWeekday, this._hass?.locale?.language ?? this._hass?.language, {
      yesterday: this._t("yesterday"),
      week: (n) => this._t("week_n").replace("{0}", String(n)),
    });
    return html`<span class="browse">
      <button class="arrow" aria-label=${this._t("browse_prev")} title=${this._t("browse_prev")} @click=${() => this._browse(-1)}>‹</button>
      ${label ? html`<span class="browse-label">${label}</span>` : nothing}
      <button class="arrow" aria-label=${this._t("browse_next")} title=${this._t("browse_next")} ?disabled=${this._offset >= 0} @click=${() => this._browse(1)}>›</button>
    </span>`;
  }

  /** Mode switch and, with two views or more, the view switch to its right. */
  private _renderSwitches(cfg: EnergyCardConfig): TemplateResult | typeof nothing {
    const modes = this._renderModeSwitch(cfg);
    const views = this._views;
    if (views.length < 2 || this._compact) return modes;
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

  // ---------- actions ----------

  /** One gesture per element, so that a hold or a double tap survives the re-renders in between. */
  private _gestures = new Map<string, Gesture>();

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

  /**
   * What an element does on tap, hold and double tap: the actions of its configuration (the Home Assistant standard),
   * and for a tap without an action `fallback`, the click it always had (select a floor or room, open more-info).
   */
  private _bind(key: string, actions: NodeActions | undefined, fallback: () => void): ActionBinding {
    let gesture = this._gestures.get(key);
    if (!gesture) this._gestures.set(key, (gesture = new Gesture()));
    const real = (a: ActionConfig | undefined) => !!a && a.action !== "none";
    const run = (a: ActionConfig | undefined) => void runAction(a, actions?.entity, this._actionDeps());
    gesture.update({
      hold: real(actions?.hold),
      double: real(actions?.double),
      onTap: () => (actions?.tap ? run(actions.tap) : fallback()),
      onHold: () => run(actions?.hold),
      onDouble: () => run(actions?.double),
    });
    const g = gesture;
    return {
      click: () => g.click(),
      down: () => g.down(),
      up: () => g.up(),
      // a long press on a touch screen opens the context menu: not when the press is a hold action
      contextmenu: (e) => {
        if (real(actions?.hold)) e.preventDefault();
      },
    };
  }

  /** Turns the switch of a consumer on or off; before turning it off the card asks when `confirm_switch` is set. */
  private _toggleSwitch(entity: string, confirm: boolean): void {
    const on = this._hass?.states[entity]?.state === "on";
    if (on && confirm && !window.confirm(this._t("confirm_switch_off"))) return;
    void this._hass?.callService?.("homeassistant", on ? "turn_off" : "turn_on", { entity_id: entity });
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
      focus: this._focus && !this._compact,
      compact: this._compact,
      thresholds: this._thresholds,
      home,
      fmt: (w) => this._fmt(w),
      consumerName: (c) => this._consumerName(c),
      secondary: this._secondKind() !== undefined,
      second: (key) => this._secondLabel(key),
      secondTitle: (key) => this._secondTitle(key),
      t: (k) => this._t(k),
      select: (s) => this._select(s),
      moreInfo: (id) => this._moreInfo(id),
      bind: (key, actions, fallback) => this._bind(key, actions, fallback),
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
      this._sankey.reset();
      return;
    }
    if (this._showsSankey) {
      this._sankey.prepare(this._sankeyContext(model, this._resolve(model)));
      return;
    }
    this._tree.prepare(this._treeContext(this._config, model, this._resolve(model), this._homeName));
  }

  protected render(): TemplateResult {
    if (this._error) return html`<ha-card><div class="error">${this._error}</div></ha-card>`;
    const cfg = this._config;
    const model = this._model;
    if (!cfg || !model || (!this._showsTimeline && !this._showsSankey && !this._tree.ready)) return html`<ha-card></ha-card>`;

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
          watts: model.floors.reduce((sum, f) => sum + f.watts, 0) + model.consumers.reduce((sum, c) => sum + c.watts, 0),
          consumers: [...model.floors.flatMap((f) => f.rooms.flatMap((r) => r.consumers)), ...model.consumers],
        }
      : allRooms
      ? {
          id: floor?.id ?? "",
          name: floor?.name ?? home,
          icon: floor?.icon ?? "mdi:home",
          color: floor?.color,
          // a floor with its own meter shows the metered value, like its node
          // without floors the consumers directly under the home belong to the whole home
          watts: floor ? floor.watts : sel.rooms.reduce((sum, r) => sum + r.watts, 0) + model.consumers.reduce((sum, c) => sum + c.watts, 0),
          consumers: [...sel.rooms.flatMap((r) => r.consumers), ...(floor ? [] : model.consumers)],
        }
      : room;

    return html`
      <ha-card style=${colorVars(cfg.colors)}>
        <header>
          <div>
            ${cfg.title ? html`<h2>${cfg.title}</h2>` : nothing}
            <div class="path">${this._renderPath(model, home, floor, room)}</div>
          </div>
          ${this._renderBadges(cfg, model)}
        </header>
        ${this._renderSwitches(cfg)}
        ${this._showsTimeline
          ? renderTimeline(this._timelineContext(model, sel))
          : this._showsSankey
            ? this._sankey.render()
            : this._tree.render(this._treeContext(cfg, model, sel, home))}
        ${this._compact || this._config?.options?.show_consumers === false ? nothing : this._renderDetail(detailRoom, listRemainder(model, allRooms ? floor : undefined, room))}
      </ha-card>
    `;
  }

  /** Self-sufficiency, self-consumption and costs, each only when it can be computed; they wrap on narrow cards. */
  private _renderBadges(cfg: EnergyCardConfig, model: EnergyModel): TemplateResult | typeof nothing {
    const own = cfg.options?.show_self_consumption !== false ? model.selfConsumption : null;
    const costs = this._renderCostBadge();
    const base = this._baseLoad();
    if (model.autarky === null && own === null && costs === nothing && base === undefined) return nothing;
    return html`<div class="badges">
      ${model.autarky !== null ? html`<div class="badge">${this._t("autarky")} ${Math.round(model.autarky * 100)} %</div>` : nothing}
      ${own !== null ? html`<div class="badge self">${this._t("self_consumption")} ${Math.round(own * 100)} %</div>` : nothing}
      ${costs}
      ${base !== undefined ? html`<div class="badge base" title=${this._t("base_load_tip")}>${this._t("base_load")} ${this._fmtAs("power", base)}</div>` : nothing}
    </div>`;
  }

  /**
   * "Kosten 3,84 € · Vergütung 1,20 €" for the shown period (power mode: today). The amount comes from the cost
   * statistics of Home Assistant when it keeps them, else from the hourly prices; the tooltip says what the
   * battery charged from the grid, when a price was missing and how the hourly calculation differs.
   */
  private _renderCostBadge(): TemplateResult | typeof nothing {
    const c = this._costs;
    if (!c) return nothing;
    const r = c.result;
    const approx = c.ha === undefined && r.approx;
    const feedIn = c.haFeedIn ?? r.feedIn;
    const text =
      `${this._t("costs")} ${approx ? "≈ " : ""}${this._money(c.ha ?? r.grid)}` +
      (feedIn !== undefined ? ` · ${this._t("feed_in_pay")} ${this._money(feedIn)}` : "");
    const tips: string[] = [];
    if (r.battery >= 0.005) tips.push(this._t("costs_battery").replace("{0}", this._money(r.battery)));
    if (approx) tips.push(this._t("costs_approx"));
    if (c.ha !== undefined && Math.abs(c.ha - r.grid) >= 0.01) tips.push(this._t("costs_ha").replace("{0}", this._money(r.grid)));
    return html`<div class="badge costs" title=${tips.join("\n") || nothing}>${text}</div>`;
  }

  /** The toggle at the end of a consumer's row; the click does not open the dialog of the row. */
  private _renderSwitch(entity: string | undefined, confirm: boolean): TemplateResult {
    if (!entity) return html`<span></span>`;
    const state = this._hass?.states[entity]?.state;
    const usable = state === "on" || state === "off";
    const flip = (e: Event) => {
      e.stopPropagation();
      if (usable) this._toggleSwitch(entity, confirm);
    };
    return html`<span class="switch ${state === "on" ? "on" : ""} ${usable ? "" : "off"}" role="switch" aria-checked=${state === "on"} aria-disabled=${!usable}
      aria-label=${this._hass?.states[entity]?.attributes.friendly_name ?? entity} title=${entity} tabindex="0"
      @click=${flip} @pointerdown=${(e: Event) => e.stopPropagation()} @keydown=${(e: KeyboardEvent) => (e.key === " " || e.key === "Enter" ? (e.preventDefault(), flip(e)) : undefined)}><i></i></span>`;
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
    const showIds = this._config?.options?.show_entity_ids !== false;
    const sorted = [...listedConsumers(room.consumers, onlyActive)].sort((a, b) => b.watts - a.watts);
    const max = Math.max(1, ...sorted.map((c) => c.watts));
    const thresholds = this._thresholds;
    const second = this._secondKind() !== undefined;
    const standby = this._standby();
    const standbyWatts = this._config?.options?.standby_watts ?? 0;
    const switches = sorted.some((x) => !!x.switchEntity);
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
        <div class="list ${second ? "second" : ""} ${switches ? "switches" : ""}">
        ${sorted.map((c) => {
          const name = this._consumerName(c);
          const list = elementThresholds(c.thresholds, thresholds.consumer);
          const barColor = this._mode === "energy" ? undefined : thresholdColor(list, c.watts);
          const level = barColor ? Math.min(thresholdLevel(list, c.watts), MAX_LEVEL) : 0;
          const barWidth = barColor ? thresholdWidth(list, c.watts) : undefined;
          const b = this._bind(nodeKey.consumer(c.entity), c.actions, () => (c.noSensor ? undefined : this._moreInfo(c.entity)));
          return html`
            <button class="row ${c.valid || c.noPower ? "" : "warn"} ${c.noPower || (c.valid && isIdle(c.watts)) ? "idle" : ""}"
              @click=${() => b.click()} @pointerdown=${() => b.down()} @pointerup=${() => b.up()} @pointerleave=${() => b.up()} @pointercancel=${() => b.up()} @contextmenu=${(e: Event) => b.contextmenu(e)}>
              <span class="name">${name}${standby.has(c.entity) ? html` <ha-icon class="standby" icon="mdi:infinity" title=${this._t("runs_always").replace("{0}", this._fmtAs("power", standbyWatts))}></ha-icon>` : nothing}${c.noSensor || c.noEnergy || c.noPower || showIds ? html`<small>${c.noSensor ? this._t("no_sensor") : c.noEnergy ? this._t("no_energy") : c.noPower ? this._t("no_power") : c.entity}</small>` : nothing}</span>
              <span class="bar" style=${styleMap({ "--level": String(level), ...(barWidth !== undefined ? { "--bar-h": `${barWidth}px` } : {}) })}><div style=${styleMap({ width: `${(c.watts / max) * 100}%`, background: barColor })}></div></span>
              <span class="val">${c.valid ? this._fmt(c.watts) : "–"}</span>
              ${second ? html`<span class="val2" title=${this._secondTitle(nodeKey.consumer(c.entity)) ?? nothing}>${this._secondLabel(nodeKey.consumer(c.entity)) ?? ""}</span>` : nothing}
              ${switches ? this._renderSwitch(c.switchEntity, c.confirmSwitch === true) : nothing}
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
