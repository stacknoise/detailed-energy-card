import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { EnergyCardConfig } from "../../model/config";
import { makeTr, type EditorKey } from "../../localize/editor";
import { defineOnce } from "../../register";
import { applySections, buildSections, checkedConfig, type ApplyMode } from "./apply";
import { collectPrefs, powerSensors, type ImportHass } from "./collect";
import { moveConsumer, propose, setConsumer, setFloor, setRoom, summarize, type Proposal, type ProposedConsumer, type ProposedRoom } from "./propose";

interface WizardHass extends ImportHass {
  language?: string;
  locale?: { language?: string };
  callWS<T>(msg: Record<string, unknown>): Promise<T>;
}

type Step = "loading" | "empty" | "error" | "sources" | "structure" | "preview";

/** Overlay that proposes the card structure from the Energy dashboard in three steps: sources, structure, preview. */
export class DetailedEnergyImportWizard extends LitElement {
  @property({ attribute: false }) hass?: WizardHass;
  /** the configuration of the card as it is now (for "add what is missing" and what stays when replacing) */
  @property({ attribute: false }) config?: EnergyCardConfig;

  @state() private _step: Step = "loading";
  @state() private _error = "";
  @state() private _proposal?: Proposal;
  @state() private _mode: ApplyMode = "replace";
  @state() private _period: "power" | "energy" = "power";
  private _loaded = false;

  static styles = css`
    :host {
      color: var(--primary-text-color);
      display: contents;
    }
    .backdrop {
      align-items: center;
      background: rgba(0, 0, 0, 0.55);
      display: flex;
      inset: 0;
      justify-content: center;
      position: fixed;
      z-index: 20;
    }
    .panel {
      background: var(--card-background-color, #1c1c1c);
      border-radius: 12px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      max-height: min(90vh, 900px);
      max-width: 720px;
      width: calc(100vw - 24px);
    }
    header {
      align-items: center;
      border-bottom: 1px solid var(--divider-color, #3f424d);
      display: flex;
      gap: 12px;
      justify-content: space-between;
      padding: 12px 16px;
    }
    h2 {
      font-size: 1.1em;
      margin: 0;
    }
    .steps {
      color: var(--secondary-text-color);
      display: flex;
      font-size: 0.85em;
      gap: 14px;
    }
    .steps .on {
      color: var(--primary-text-color);
      font-weight: 600;
    }
    .body {
      overflow: auto;
      padding: 12px 16px;
    }
    footer {
      border-top: 1px solid var(--divider-color, #3f424d);
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      padding: 10px 16px;
    }
    button {
      background: none;
      border: 1px solid var(--divider-color, #3f424d);
      border-radius: 8px;
      color: inherit;
      cursor: pointer;
      font: inherit;
      padding: 6px 14px;
    }
    button.primary {
      background: var(--primary-color, #03a9f4);
      border-color: var(--primary-color, #03a9f4);
      color: var(--text-primary-color, #fff);
    }
    button:disabled {
      cursor: default;
      opacity: 0.45;
    }
    .hint,
    .muted {
      color: var(--secondary-text-color);
      font-size: 0.85em;
    }
    .warn {
      color: var(--warning-color, #ffa600);
      font-size: 0.9em;
      margin: 6px 0;
    }
    .row {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 3px 0;
    }
    .row.child {
      padding-left: 22px;
    }
    .row.off {
      opacity: 0.55;
    }
    .group {
      border: 1px solid var(--divider-color, #3f424d);
      border-radius: 8px;
      margin: 8px 0;
      padding: 6px 10px;
    }
    .group > .row.head {
      font-weight: 600;
    }
    .room {
      margin-left: 18px;
    }
    .pick {
      margin-left: auto;
    }
    select,
    input[type="text"] {
      background: var(--card-background-color, #1c1c1c);
      border: 1px solid var(--divider-color, #3f424d);
      border-radius: 6px;
      color: inherit;
      font: inherit;
      max-width: 240px;
      padding: 3px 6px;
    }
    .modes label {
      display: block;
      padding: 2px 0;
    }
    .preview {
      border: 1px solid var(--divider-color, #3f424d);
      border-radius: 8px;
      margin-top: 8px;
      padding: 6px;
    }
    .toggle {
      display: flex;
      gap: 4px;
      margin: 8px 0 0;
    }
    .toggle button.on {
      background: color-mix(in srgb, var(--primary-color, #03a9f4) 25%, transparent);
      border-color: var(--primary-color, #03a9f4);
    }
    a {
      color: var(--primary-color, #03a9f4);
    }
  `;

  private get _tr() {
    return makeTr(this.hass?.locale?.language ?? this.hass?.language);
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("hass") && this.hass && !this._loaded) {
      this._loaded = true;
      void this._load();
    }
  }

  protected updated(): void {
    // the preview card is a real card with the same hass
    const card = this.renderRoot.querySelector<HTMLElement & { setConfig(c: unknown): void; hass?: unknown }>("detailed-energy-card");
    const preview = this._previewConfig();
    if (card && preview) {
      const key = JSON.stringify(preview);
      if ((card as unknown as { _wizKey?: string })._wizKey !== key) {
        (card as unknown as { _wizKey?: string })._wizKey = key;
        card.setConfig(preview);
      }
      card.hass = this.hass;
    }
  }

  private async _load(): Promise<void> {
    const hass = this.hass!;
    try {
      const prefs = await hass.callWS<unknown>({ type: "energy/get_prefs" });
      const collected = collectPrefs(prefs, hass);
      if (collected.empty) {
        this._step = "empty";
        return;
      }
      this._proposal = propose(collected, hass);
      const c = this.config;
      this._mode = (c?.sources?.length || c?.floors?.length || c?.rooms?.length) ? "merge" : "replace";
      this._step = "sources";
    } catch (e) {
      // Home Assistant answers "No prefs." while the Energy dashboard was never set up
      const message = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
      if (/no prefs/i.test(message)) this._step = "empty";
      else {
        this._error = message;
        this._step = "error";
      }
    }
  }

  private _sections() {
    return this._proposal ? buildSections(this._proposal) : undefined;
  }

  private _previewConfig(): EnergyCardConfig | undefined {
    const s = this._sections();
    if (!s || this._step !== "preview") return undefined;
    const cfg = applySections(this.config, s, this._mode);
    return { ...cfg, options: { ...cfg.options, mode: this._period, remember_selection: false, storage_id: "wizard" } };
  }

  private _change(fn: (p: Proposal) => void): void {
    if (!this._proposal) return;
    fn(this._proposal);
    this.requestUpdate();
  }

  private _close(): void {
    this.dispatchEvent(new CustomEvent("wizard-close", { bubbles: true, composed: true }));
  }

  private _apply(): void {
    const s = this._sections();
    if (!s) return;
    const config = applySections(this.config, s, this._mode);
    this.dispatchEvent(new CustomEvent("wizard-apply", { detail: { config }, bubbles: true, composed: true }));
  }

  // ---------- rendering ----------

  protected render(): TemplateResult {
    const tr = this._tr;
    const steps: Array<[Step, EditorKey]> = [
      ["sources", "wiz_step_sources"],
      ["structure", "wiz_step_structure"],
      ["preview", "wiz_step_preview"],
    ];
    return html`<div class="backdrop" role="dialog" aria-modal="true" aria-label=${tr("wiz_title")}>
      <div class="panel">
        <header>
          <h2>${tr("wiz_title")}</h2>
          <div class="steps">${steps.map(([s, label]) => html`<span class=${this._step === s ? "on" : ""}>${tr(label)}</span>`)}</div>
        </header>
        <div class="body">${this._body()}</div>
        <footer>${this._footer()}</footer>
      </div>
    </div>`;
  }

  private _body(): TemplateResult {
    const tr = this._tr;
    switch (this._step) {
      case "loading":
        return html`<div class="muted">${tr("wiz_loading")}</div>`;
      case "empty":
        return html`<div>${tr("wiz_empty")} <a href="/config/energy" target="_top">${tr("wiz_empty_link")}</a></div>`;
      case "error":
        return html`<div class="warn">${tr("wiz_error", this._error)}</div>`;
      case "sources":
        return this._sources();
      case "structure":
        return this._structure();
      default:
        return this._preview();
    }
  }

  private _footer(): TemplateResult {
    const tr = this._tr;
    const next = (to: Step, label: EditorKey) => html`<button class="primary" @click=${() => (this._step = to)}>${tr(label)}</button>`;
    const back = (to: Step) => html`<button @click=${() => (this._step = to)}>${tr("wiz_back")}</button>`;
    const cancel = html`<button @click=${() => this._close()}>${tr("wiz_cancel")}</button>`;
    switch (this._step) {
      case "sources":
        return html`${cancel}${next("structure", "wiz_next")}`;
      case "structure":
        return html`${cancel}${back("sources")}${next("preview", "wiz_next")}`;
      case "preview": {
        const bad = checkedConfig(applySections(this.config, this._sections()!, this._mode)).error;
        return html`${cancel}${back("structure")}<button class="primary" ?disabled=${!!bad} @click=${() => this._apply()}>${tr("wiz_apply")}</button>`;
      }
      default:
        return cancel;
    }
  }

  private _sources(): TemplateResult {
    const tr = this._tr;
    const p = this._proposal!;
    const all = powerSensors(this.hass!);
    if (!p.sources.length) return html`<div class="muted">${tr("wiz_no_sources")}</div>${p.foldedSources ? html`<div class="hint">${tr("wiz_folded", p.foldedSources)}</div>` : nothing}`;
    return html`<div class="hint">${tr("wiz_sources_hint")}</div>
      ${p.foldedSources ? html`<div class="hint">${tr("wiz_folded", p.foldedSources)}</div>` : nothing}
      ${p.sources.map((s) => {
        const power = s.power ?? s.chosenPower;
        const choices = s.powerChoices.length ? s.powerChoices : all;
        const counters = [s.energy, s.energyReturn].filter(Boolean).join(" · ");
        return html`<div class="group">
          <div class="row ${s.usable ? "" : "off"}">
            <label><input type="checkbox" .checked=${s.selected} ?disabled=${!s.usable || !power}
              @change=${(e: Event) => this._change(() => (s.selected = (e.target as HTMLInputElement).checked))} />
              <b>${s.name ?? this._tr(`wiz_type_${s.type}` as EditorKey)}</b></label>
            <span class="muted">${counters}</span>
          </div>
          ${!s.usable ? html`<div class="warn">${tr("wiz_unusable")}</div>` : nothing}
          ${s.usable && !s.power
            ? html`<div class="row"><span class="muted">${tr("wiz_power")}</span>
                <select @change=${(e: Event) =>
                  this._change(() => {
                    const v = (e.target as HTMLSelectElement).value;
                    s.chosenPower = v || undefined;
                    s.selected = !!v;
                  })}>
                  <option value="">${tr("wiz_choose")}</option>
                  ${choices.map((id) => html`<option value=${id} ?selected=${id === s.chosenPower}>${id}</option>`)}
                </select>
                ${!power ? html`<span class="muted">${tr("wiz_needs_power")}</span>` : nothing}</div>`
            : html`<div class="row muted">${tr("wiz_power")}: ${power ?? ""}</div>`}
        </div>`;
      })}`;
  }

  private _consumer(c: ProposedConsumer, p: Proposal): TemplateResult {
    const tr = this._tr;
    const hass = this.hass!;
    const rooms = Object.values(hass.areas ?? {}).filter((a): a is NonNullable<typeof a> => !!a).sort((a, b) => a.name.localeCompare(b.name));
    const parentName = c.parent ? p.floors.flatMap((f) => f.rooms).concat(p.looseRooms).flatMap((r) => [...r.consumers, ...(r.meter ? [r.meter] : [])]).find((x) => x.stat === c.parent)?.name ?? c.parent : undefined;
    return html`<div class="row ${c.parent ? "child" : ""} ${c.usable ? "" : "off"}">
      <label><input type="checkbox" .checked=${c.selected} ?disabled=${!c.usable}
        @change=${(e: Event) => this._change((pr) => setConsumer(pr, c.stat, (e.target as HTMLInputElement).checked))} /></label>
      <input type="text" .value=${c.rename ?? c.name} aria-label=${tr("wiz_rename")}
        @change=${(e: Event) => this._change(() => (c.rename = (e.target as HTMLInputElement).value.trim() || undefined))} />
      ${parentName ? html`<span class="muted">${tr("wiz_part_of", parentName)}</span>` : nothing}
      ${!c.usable ? html`<span class="warn">${tr("wiz_unusable")}</span>` : nothing}
      ${!c.power && c.powerChoices.length
        ? html`<select title=${tr("wiz_power")} @change=${(e: Event) => this._change(() => (c.power = (e.target as HTMLSelectElement).value || undefined))}>
            <option value="">${tr("wiz_power")}: –</option>
            ${c.powerChoices.map((id) => html`<option value=${id}>${id}</option>`)}
          </select>`
        : nothing}
      <select class="pick" title=${tr("wiz_room_select")} aria-label=${tr("wiz_room_select")}
        @change=${(e: Event) => this._change((pr) => moveConsumer(pr, hass, c.stat, (e.target as HTMLSelectElement).value || undefined))}>
        <option value="" ?selected=${!c.areaId}>${tr("wiz_no_room")}</option>
        ${rooms.map((a) => html`<option value=${a.area_id} ?selected=${a.area_id === c.areaId}>${a.name}</option>`)}
      </select>
    </div>`;
  }

  private _room(r: ProposedRoom, p: Proposal): TemplateResult {
    const tr = this._tr;
    return html`<div class="room">
      <div class="row head">
        <label><input type="checkbox" .checked=${r.selected} @change=${(e: Event) => this._change((pr) => setRoom(pr, r.areaId, (e.target as HTMLInputElement).checked))} /> ${r.name}</label>
        ${r.meter ? html`<span class="muted">${tr("wiz_meter")}: ${r.meter.rename ?? r.meter.name}</span>` : nothing}
      </div>
      ${r.consumers.map((c) => this._consumer(c, p))}
    </div>`;
  }

  private _structure(): TemplateResult {
    const tr = this._tr;
    const p = this._proposal!;
    return html`<div class="hint">${tr("wiz_structure_hint")}</div>
      ${p.floors.map(
        (f) => html`<div class="group">
          <div class="row head"><label><input type="checkbox" .checked=${f.selected} @change=${(e: Event) => this._change((pr) => setFloor(pr, f.floorId, (e.target as HTMLInputElement).checked))} /> ${f.name}</label></div>
          ${f.rooms.map((r) => this._room(r, p))}
        </div>`,
      )}
      ${p.looseRooms.length
        ? html`<div class="group"><div class="row head muted">${tr("wiz_no_floor")}</div>${p.looseRooms.map((r) => this._room(r, p))}</div>`
        : nothing}
      ${p.noRoom.length
        ? html`<div class="group"><div class="row head muted">${tr("wiz_no_room")}</div>${p.noRoom.map((c) => this._consumer(c, p))}</div>`
        : nothing}`;
  }

  private _preview(): TemplateResult {
    const tr = this._tr;
    const s = this._sections()!;
    const sum = summarize(this._proposal!);
    const applied = applySections(this.config, s, this._mode);
    const bad = checkedConfig(applied).error;
    const hasExisting = !!(this.config?.sources?.length || this.config?.floors?.length || this.config?.rooms?.length);
    return html`<div>${tr("wiz_summary", sum.sources, sum.floors, sum.rooms, sum.consumers, sum.skipped)}</div>
      ${s.unplaced.length ? html`<div class="warn">${tr("wiz_unplaced", s.unplaced.join(", "))}</div>` : nothing}
      ${bad ? html`<div class="warn">${tr("wiz_conflict", bad)}</div>` : nothing}
      ${hasExisting
        ? html`<div class="modes"><div class="hint">${tr("wiz_mode")}</div>
            <label><input type="radio" name="mode" .checked=${this._mode === "replace"} @change=${() => (this._mode = "replace")} /> ${tr("wiz_replace")}</label>
            <label><input type="radio" name="mode" .checked=${this._mode === "merge"} @change=${() => (this._mode = "merge")} /> ${tr("wiz_merge")}</label>
          </div>`
        : nothing}
      <div class="toggle">
        <button class=${this._period === "power" ? "on" : ""} @click=${() => (this._period = "power")}>${tr("wiz_now")}</button>
        <button class=${this._period === "energy" ? "on" : ""} @click=${() => (this._period = "energy")}>${tr("wiz_today")}</button>
      </div>
      <div class="preview"><detailed-energy-card></detailed-energy-card></div>`;
  }
}

defineOnce("detailed-energy-import-wizard", DetailedEnergyImportWizard);
