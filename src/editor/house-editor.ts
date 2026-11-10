import { LitElement, css, html, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { HouseConfig } from "../model/house";
import { makeTr } from "../localize/editor";
import { defineOnce } from "../register";
import "./house-grid";

interface Hass {
  states: Record<string, unknown>;
  language?: string;
  locale?: { language?: string };
  [k: string]: unknown;
}

/** Card editor of the 3D card (AP6 builds the form around the grid; for now a note). */
export class DetailedEnergy3DCardEditor extends LitElement {
  @property({ attribute: false }) hass?: Hass;
  @state() config?: HouseConfig;

  static styles = css`
    :host {
      display: block;
    }
  `;

  setConfig(config: HouseConfig): void {
    this.config = config;
  }

  protected render(): TemplateResult {
    const tr = makeTr(this.hass?.locale?.language ?? this.hass?.language);
    return html`<p>${tr("house_ed_placeholder")}</p>`;
  }
}

defineOnce("detailed-energy-3d-card-editor", DetailedEnergy3DCardEditor);
