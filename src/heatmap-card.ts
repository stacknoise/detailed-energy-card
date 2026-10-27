import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { cardStyles } from "./styles/theme";
import { localTime, loadStatSeries, periodRange, firstWeekdayIndex } from "./model/energy";
import { EnergyStore, type EnergyQuery } from "./model/energy-store";
import { HEATMAP_MAX_DAYS, costliestHour, heatLevel, heatmapGrid, peakHour, validateHeatmapConfig, type HeatmapConfig } from "./model/heatmap";
import { baseLoad } from "./model/standby";
import { formatEnergy, formatPower, type StateLike } from "./model/units";
import { localize, type Key } from "./localize";
import { defineOnce, registerCardOnce } from "./register";
import "./editor/heatmap-editor";

interface Hass {
  language?: string;
  locale?: { language?: string; first_weekday?: string };
  config?: { time_zone?: string; currency?: string };
  callWS<T>(msg: Record<string, unknown>): Promise<T>;
  states: Record<string, StateLike | undefined>;
}

const HOUR = 3_600_000;

/** Heatmap of the energy of the home: a row per day, a column per hour, the color is the consumption of that hour. */
export class DetailedEnergyHeatmapCard extends LitElement {
  static styles = [
    cardStyles,
    css`
      .grid {
        display: grid;
        gap: 2px;
        grid-template-columns: 4.2em repeat(24, minmax(0, 1fr));
      }
      .grid .axis {
        color: var(--_muted);
        font-size: 0.7em;
        grid-column: span 6;
        line-height: 1.4;
      }
      .grid .day {
        align-items: center;
        color: var(--_muted);
        display: flex;
        font-size: 0.72em;
        white-space: nowrap;
      }
      .cell {
        background: color-mix(in srgb, var(--_accent) var(--level, 0%), transparent);
        border-radius: 2px;
        height: 16px;
      }
      .cell.missing {
        background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--_muted) 30%, transparent) 0 2px, transparent 2px 4px);
      }
      .cell.future {
        background: none;
        border: 1px dashed var(--_line);
        box-sizing: border-box;
      }
      .legend-bar {
        align-items: center;
        color: var(--_muted);
        display: flex;
        font-size: 0.72em;
        gap: 6px;
        justify-content: flex-end;
        margin-top: 8px;
      }
      .legend-bar i {
        background: linear-gradient(90deg, color-mix(in srgb, var(--_accent) 8%, transparent), var(--_accent));
        border-radius: 2px;
        display: inline-block;
        height: 8px;
        width: 70px;
      }
      .empty {
        color: var(--_muted);
        font-size: 0.85em;
        padding: 30px 0;
        text-align: center;
      }
    `,
  ];

  @state() private _config?: HeatmapConfig;
  @state() private _error?: string;
  private _hass?: Hass;
  private _store = new EnergyStore(
    (q) => this._load(q),
    () => this.requestUpdate(),
    () => this.isConnected,
  );

  static getConfigElement(): HTMLElement {
    return document.createElement("detailed-energy-heatmap-card-editor");
  }

  /** The first energy sensor that looks like the home's counter. */
  static getStubConfig(hass?: { states: Record<string, { attributes?: { device_class?: unknown } } | undefined> }): Record<string, unknown> {
    const entity = Object.entries(hass?.states ?? {}).find(([id, s]) => id.startsWith("sensor.") && s?.attributes?.device_class === "energy")?.[0];
    return { type: "custom:detailed-energy-heatmap-card", entity: entity ?? "sensor.home_energy", days: 7 };
  }

  setConfig(config: unknown): void {
    try {
      this._config = validateHeatmapConfig(config);
      this._error = undefined;
      this._store.clear();
      this._ensure();
    } catch (e) {
      this._error = (e as Error).message;
      this._config = undefined;
    }
  }

  set hass(hass: Hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._ensure();
    this.requestUpdate();
  }

  getCardSize(): number {
    return 6;
  }

  getGridOptions() {
    return { columns: 12, rows: "auto", min_columns: 6 };
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._store.refresh();
  }

  disconnectedCallback(): void {
    this._store.pause();
    super.disconnectedCallback();
  }

  // ---------- data ----------

  private get _days(): number {
    return Math.min(HEATMAP_MAX_DAYS, this._config?.days ?? 7);
  }

  private get _tz(): string {
    return this._hass?.config?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  private get _lang(): string | undefined {
    return this._hass?.locale?.language ?? this._hass?.language;
  }

  /** Hourly energy of the last days, and the hourly means of the price sensor. */
  private _queries(): EnergyQuery[] {
    const cfg = this._config;
    if (!cfg) return [];
    const hours = this._days * 24 + 25;
    const out: EnergyQuery[] = [{ ids: [cfg.entity], period: "today", hours, stat: "hour" }];
    if (cfg.price_entity) out.push({ ids: [cfg.price_entity], period: "today", hours, stat: "hour", kind: "mean" });
    return out;
  }

  private _ensure(): void {
    if (this._config && this._hass) this._store.want(this._queries());
  }

  private async _load(q: EnergyQuery) {
    const now = new Date();
    const start = new Date(Math.floor((now.getTime() - (q.hours ?? 24) * HOUR) / HOUR) * HOUR);
    return { series: await loadStatSeries(this._hass!, q.ids, start, now, "hour", q.kind) };
  }

  // ---------- render ----------

  private _t(key: Key): string {
    return localize(this._lang, key);
  }

  private _money(v: number): string {
    const currency = this._config?.currency ?? this._hass?.config?.currency ?? "EUR";
    try {
      return new Intl.NumberFormat(this._lang, { style: "currency", currency }).format(v);
    } catch {
      return `${v.toFixed(2)} ${currency}`;
    }
  }

  /** "Mo 19.10." */
  private _dayLabel(t: number): string {
    const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(this._lang, { timeZone: this._tz, ...o }).format(new Date(t));
    return `${fmt({ weekday: "short" })} ${fmt({ day: "numeric", month: "numeric" })}`;
  }

  private _hourRange(t: number): string {
    const two = (h: number) => String(h).padStart(2, "0");
    const h = localTime(new Date(t), this._tz).hour;
    return this._t("tl_hour").replace("{0}", two(h)).replace("{1}", two((h + 1) % 24));
  }

  protected render(): TemplateResult {
    if (this._error) return html`<ha-card><div class="error">${this._error}</div></ha-card>`;
    const cfg = this._config;
    if (!cfg) return html`<ha-card></ha-card>`;
    const [energyQ, priceQ] = this._queries();
    const rows = this._store.series(energyQ)?.get(cfg.entity);
    const head = cfg.title ? html`<h2>${cfg.title}</h2>` : nothing;
    if (!rows) {
      const failed = this._store.status(energyQ) === "error";
      return html`<ha-card><header><div>${head}</div></header><div class="empty">${this._t(failed ? "energy_error" : "energy_loading")}</div></ha-card>`;
    }
    const now = Date.now();
    const days = this._days;
    const fw = firstWeekdayIndex(this._hass?.locale?.first_weekday, this._lang);
    const starts = Array.from({ length: days }, (_, i) => periodRange("today", new Date(now), this._tz, fw, -(days - 1 - i)).start.getTime());
    const grid = heatmapGrid(rows, starts, this._tz, now);
    const inRange = rows.filter((r) => r.start >= starts[0]);
    if (!inRange.length) return html`<ha-card><header><div>${head}</div></header><div class="empty">${this._t("hm_empty")}</div></ha-card>`;
    const decimals = 1;

    const kpis: Array<{ value: string; label: string; title?: string }> = [];
    const base = baseLoad(inRange, this._tz);
    if (base !== undefined) kpis.push({ value: formatPower(base, "auto", 0, this._lang), label: this._t("base_load"), title: this._t("hm_base_tip") });
    kpis.push({ value: formatEnergy(inRange.reduce((s, r) => s + r.wh, 0), decimals, this._lang), label: this._t("hm_total").replace("{0}", String(days)) });
    const priceRows = priceQ ? this._store.series(priceQ)?.get(cfg.price_entity!) : undefined;
    const hasPrice = cfg.price !== undefined || !!priceRows?.length;
    const costly = hasPrice ? costliestHour(inRange, cfg.price !== undefined ? { fixed: cfg.price } : { rows: priceRows }, now) : undefined;
    if (costly) {
      kpis.push({
        value: this._money(costly.cost),
        label: this._t("hm_costly").replace("{0}", `${this._dayLabel(costly.start)} ${this._hourRange(costly.start)}`),
      });
    } else {
      const peak = peakHour(inRange);
      if (peak) kpis.push({ value: formatEnergy(peak.wh, decimals, this._lang), label: this._t("hm_peak").replace("{0}", `${this._dayLabel(peak.start)} ${this._hourRange(peak.start)}`) });
    }

    return html`
      <ha-card>
        <header><div>${head}</div></header>
        <div class="kpis">${kpis.map((k) => html`<div class="kpi" title=${k.title ?? nothing}><b>${k.value}</b><span>${k.label}</span></div>`)}</div>
        <div class="grid" role="img" aria-label=${cfg.title ?? this._t("hm_title")}>
          <span></span>
          ${[0, 6, 12, 18].map((h) => html`<span class="axis">${String(h).padStart(2, "0")}</span>`)}
          ${grid.days.map(
            (d) => html`<span class="day">${this._dayLabel(d.start)}</span>${d.cells.map((c, h) => this._cell(d.start, h, c, grid.max))}`,
          )}
        </div>
        <div class="legend-bar">0<i></i>${formatEnergy(grid.max, 2, this._lang)}</div>
      </ha-card>
    `;
  }

  private _cell(dayStart: number, hour: number, cell: number | "missing" | "future", max: number): TemplateResult {
    const label = `${this._dayLabel(dayStart)} ${this._t("tl_hour").replace("{0}", String(hour).padStart(2, "0")).replace("{1}", String((hour + 1) % 24).padStart(2, "0"))}`;
    if (cell === "future") return html`<span class="cell future"></span>`;
    if (cell === "missing") return html`<span class="cell missing" title=${`${label}: ${this._t("hm_missing")}`}></span>`;
    const level = Math.round(8 + heatLevel(cell, max) * 92);
    return html`<span class="cell" style=${`--level:${level}%`} title=${`${label}: ${formatEnergy(cell, 2, this._lang)}`}></span>`;
  }
}

defineOnce("detailed-energy-heatmap-card", DetailedEnergyHeatmapCard);
window.customCards ??= [];
registerCardOnce(window.customCards, {
  type: "detailed-energy-heatmap-card",
  name: "Detailed Energy Heatmap",
  description: localize(typeof navigator === "undefined" ? undefined : navigator.language, "hm_picker_description"),
  preview: true,
});
