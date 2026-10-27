import { LitElement, css, html, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HeatmapConfig } from "../model/heatmap";
import type { StateLike } from "../model/units";
import { defineOnce } from "../register";
import { makeTr } from "../localize/editor";
import { getPath, setPath } from "./config-utils";
import { HEATMAP, helperFor, labelFor, toSchema } from "./schema";
import { fieldErrors } from "./validation";

interface Hass {
  states: Record<string, unknown>;
  language?: string;
  locale?: { language?: string };
  [k: string]: unknown;
}

/** Editor of the heatmap card: the sensor, the number of days, the title and optionally a price. */
export class DetailedEnergyHeatmapCardEditor extends LitElement {
  @property({ attribute: false }) hass?: Hass;
  @state() private _config?: HeatmapConfig;

  static styles = css`
    :host {
      display: block;
    }
    ha-form {
      display: block;
    }
  `;

  setConfig(config: HeatmapConfig): void {
    this._config = config;
  }

  private get _tr() {
    return makeTr(this.hass?.locale?.language ?? this.hass?.language);
  }

  /** ha-form reports the whole flat data object; apply only the changed fields. */
  private _onForm(ev: CustomEvent): void {
    ev.stopPropagation();
    const data = ev.detail.value as Record<string, unknown>;
    let next: object = this._config ?? {};
    for (const f of HEATMAP) {
      const current = getPath(next, f.path) ?? f.default;
      if (!(f.path in data) && current === undefined) continue;
      if (data[f.path] !== current) next = setPath(next, f.path, data[f.path]);
    }
    this._config = next as HeatmapConfig;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: next }, bubbles: true, composed: true }));
  }

  protected render(): TemplateResult {
    const obj = this._config ?? {};
    const data: Record<string, unknown> = {};
    for (const f of HEATMAP) data[f.path] = getPath(obj, f.path) ?? f.default;
    const states = (this.hass?.states ?? {}) as Record<string, StateLike | undefined>;
    return html`<ha-form
      .hass=${this.hass}
      .data=${data}
      .schema=${toSchema(HEATMAP, obj, this._tr)}
      .error=${fieldErrors(obj, HEATMAP, states, getPath, this._tr)}
      .computeLabel=${(s: { name: string }) => labelFor(HEATMAP, s.name, this._tr)}
      .computeHelper=${(s: { name: string }) => helperFor(HEATMAP, s.name, this._tr)}
      @value-changed=${(ev: CustomEvent) => this._onForm(ev)}
    ></ha-form>`;
  }
}

defineOnce("detailed-energy-heatmap-card-editor", DetailedEnergyHeatmapCardEditor);
