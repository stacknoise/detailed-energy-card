import { LitElement, css, html, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import { cardStyles } from "./styles/theme";
import { HOUSE_CARD_TYPE, emptyScene, gridOf, validateHouseConfig, type HouseConfig } from "./model/house";
import { buildStubConfig, type StubHass } from "./model/stub-config";
import { localize } from "./localize";
import { renderHouse } from "./view/house";
import { defineOnce, registerCardOnce } from "./register";
import "./editor/house-editor";

interface Hass extends StubHass {
  language?: string;
  locale?: { language?: string };
}

/**
 * The 3D card: the home as floors in isometric view (variant A of the mocks) with a floor-plan editor.
 * AP0 is the skeleton: it registers, validates the config and mounts an empty graphic. Computing the model (AP4),
 * the scene (AP2) and the drawing (AP3) are filled in by the packages.
 */
export class DetailedEnergy3DCard extends LitElement {
  static styles = [
    cardStyles,
    css`
      .placeholder,
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
    `,
  ];

  @state() private _config?: HouseConfig;
  @state() private _error?: string;
  private _hass?: Hass;

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
    } catch (e) {
      this._error = (e as Error).message;
      this._config = undefined;
    }
  }

  set hass(hass: Hass) {
    this._hass = hass;
    this.requestUpdate();
  }

  getCardSize(): number {
    return 8;
  }

  getGridOptions() {
    return { columns: 12, rows: "auto", min_columns: 6 };
  }

  private get _lang(): string | undefined {
    return this._hass?.locale?.language ?? this._hass?.language;
  }

  protected render(): TemplateResult {
    if (this._error) return html`<ha-card><div class="error">${this._error}</div></ha-card>`;
    if (!this._config) return html`<ha-card></ha-card>`;
    const { cols, rows } = gridOf(this._config);
    return html`<ha-card .header=${this._config.title}>
      ${renderHouse(emptyScene(cols, rows), { narrow: false, animate: false, onSelect: () => undefined })}
      <div class="placeholder">${localize(this._lang, "house_placeholder")}</div>
    </ha-card>`;
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
