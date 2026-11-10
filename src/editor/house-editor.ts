import { LitElement, css, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import type { RoomConfig } from "../model/config";
import { gridOf, validateLayout, type HouseConfig, type HouseGridEventMap, type RoomLayout } from "../model/house";
import { RegistrySource, type Registries, type RegistryHass } from "../model/registry";
import type { StateLike } from "../model/units";
import { makeTr, type Tr } from "../localize/editor";
import { defineOnce } from "../register";
import { observedEntityIds, getPath } from "./config-utils";
import { hassChangedForEditor, type EditorHass } from "./hass-change";
import { HOUSE, helperFor, houseFields, labelFor, toSchema, type Field } from "./schema";
import { fieldErrors } from "./validation";
import { EDITOR_SECTIONS, type DetailedEnergyCardEditor, type EditorSection } from "./card-editor";
import {
  CUSTOM_AREA,
  areaChoices,
  floorViews,
  freeSpot,
  gridRooms,
  layoutsOf,
  unplacedRooms,
  usedAreaIds,
  withGrid,
  withoutClashingLayouts,
  withNewRoom,
  withAutoLayouts,
  withPinnedAuto,
  withRoomLayout,
  withoutRoom,
  type AutoPlacement,
  type FloorView,
} from "./house-layout";
import "./card-editor";
import "./house-grid";

interface Hass {
  states: Record<string, unknown>;
  language?: string;
  locale?: { language?: string };
  callWS?<T>(msg: { type: string }): Promise<T>;
  [k: string]: unknown;
}

/** Sections of the energy card's editor that the 3D card has too; the import wizard would replace the floors and rooms and is left out. */
export const HOUSE_SECTIONS: readonly EditorSection[] = EDITOR_SECTIONS.filter((s) => s !== "import");

/**
 * The General fields the 3D card reads: its title, the number format, the flow animation and the lines by source of
 * the graphic, and the options of the detail list below it (consumers, entity ids, unassigned rest, remembered selection).
 * The rest of the energy card's options (compact view, source mix, forecasts, energy mode ...) has no effect there.
 */
export const HOUSE_GENERAL_FIELDS: readonly string[] = [
  "title",
  "options.unit",
  "options.decimals",
  "options.animation",
  "options.lines_by_source",
  "options.show_consumers",
  "options.only_active_consumers",
  "options.show_entity_ids",
  "options.show_unassigned",
  "options.remember_selection",
  "options.storage_id",
];

/** A room just drawn on the grid that waits for its area (or a name) before it is added to the config. */
interface Draft {
  layout: RoomLayout;
  area: string;
  name: string;
}

/**
 * Card editor of the 3D card (AP6): the floor plan (floor tabs, `<detailed-energy-house-grid>`, form of the selected
 * room, grid size) on top, below it the energy card's editor with the sections the 3D card has (general, colors, home,
 * sources, structure), so consumers, meters and sources are edited in the one place they always were.
 */
export class DetailedEnergy3DCardEditor extends LitElement {
  @property({ attribute: false }) hass?: Hass;
  @state() config?: HouseConfig;
  /** index of the floor tab */
  @state() private _floor = 0;
  /** area id of the selected room */
  @state() private _sel?: string;
  /** a drawn room that waits for its area */
  @state() private _draft?: Draft;
  /** the room whose delete button was clicked once (rooms with consumers need a second click) */
  @state() private _confirm?: string;
  /** messages under single fields of the room form, by field path */
  @state() private _errors: Record<string, string> = {};
  /** short message when an edit was refused */
  @state() private _notice?: string;
  private _registries = new RegistrySource(() => this.requestUpdate());
  /** the config last handed to the embedded energy editor */
  private _pushed?: HouseConfig;
  /** the config last handed to the preview card */
  private _previewed?: HouseConfig;
  /** Home Assistant shows its own preview of the card next to this editor: ours is left out */
  @state() private _haPreview = false;
  private _resize?: ResizeObserver;

  static styles = css`
    :host {
      display: block;
    }
    section {
      border: 1px solid var(--divider-color, #3f424d);
      border-radius: 8px;
      margin-bottom: 12px;
      padding: 4px 12px 12px;
    }
    h3 {
      font-size: 1em;
      margin: 12px 0 8px;
    }
    ha-form {
      display: block;
    }
    .hint {
      color: var(--secondary-text-color);
      font-size: 0.85em;
      margin: 8px 0;
    }
    .warn {
      color: var(--warning-color, #ffa600);
      font-size: 0.9em;
      margin: 4px 0;
    }
    .tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 8px;
    }
    button {
      background: none;
      border: 1px solid var(--divider-color, #3f424d);
      border-radius: 8px;
      color: inherit;
      cursor: pointer;
      font: inherit;
      padding: 6px 12px;
    }
    button[aria-pressed="true"] {
      background: var(--primary-color);
      border-color: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    button.add {
      border-style: dashed;
      color: var(--primary-color);
      margin: 8px 8px 0 0;
    }
    button.danger {
      color: var(--error-color, #db4437);
    }
    button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 1px;
    }
    .panel {
      border-top: 1px solid var(--divider-color, #3f424d);
      margin-top: 12px;
      padding-top: 4px;
    }
    .row {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: space-between;
    }
    detailed-energy-house-grid {
      margin-top: 8px;
    }
  `;

  setConfig(config: HouseConfig): void {
    this.config = config;
  }

  private get _tr(): Tr {
    return makeTr(this.hass?.locale?.language ?? this.hass?.language);
  }

  private get _reg(): Registries | undefined {
    return this._registries.get(this.hass as RegistryHass | undefined);
  }

  private _ids?: { cfg: HouseConfig; ids: string[] };

  /** Entity ids used by the config; recomputed only when the config object changes. */
  private get _entityIds(): string[] {
    const cfg = this.config;
    if (!cfg) return [];
    if (this._ids?.cfg !== cfg) {
      let ids: string[] = [];
      try {
        ids = observedEntityIds(cfg);
      } catch {
        return [];
      }
      this._ids = { cfg, ids };
    }
    return this._ids.ids;
  }

  /** A new `hass` arrives with every state change of the instance; skip those that do not concern the editor. */
  protected shouldUpdate(changed: PropertyValues): boolean {
    if (changed.size !== 1 || !changed.has("hass")) return true;
    return hassChangedForEditor(changed.get("hass") as EditorHass | undefined, this.hass as EditorHass | undefined, this._entityIds);
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._resize = new ResizeObserver(() => this._checkHaPreview());
    this._resize.observe(this);
    window.addEventListener("resize", this._checkHaPreview);
    this._checkHaPreview();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resize?.disconnect();
    window.removeEventListener("resize", this._checkHaPreview);
  }

  /** Looks for the preview of the card dialog of Home Assistant beside this editor (`.element-preview`, in older versions `hui-card-preview`) above this editor and whether it is visible. */
  private _checkHaPreview = (): void => {
    let root = this.getRootNode();
    let visible = false;
    while (root instanceof ShadowRoot) {
      const preview = root.querySelector("hui-card-preview, .element-preview");
      if (preview) {
        const r = preview.getBoundingClientRect();
        // beside the editor: on a narrow dialog Home Assistant puts its preview below the whole form, out of sight
        visible = r.width > 0 && r.height > 0 && getComputedStyle(preview).visibility !== "hidden" && r.left >= this.getBoundingClientRect().right - 1;
        break;
      }
      root = root.host.getRootNode();
    }
    if (visible !== this._haPreview) this._haPreview = visible;
  };

  protected willUpdate(): void {
    this._registries.ensure(this.hass as RegistryHass | undefined);
  }

  /** Hands the config to the embedded energy editor whenever it changed here, so its next edit does not undo a layout change. */
  protected updated(): void {
    this._updatePreview();
    const inner = this.renderRoot.querySelector<DetailedEnergyCardEditor>("detailed-energy-card-editor");
    if (inner && this.config && this._pushed !== this.config) {
      this._pushed = this.config;
      inner.setConfig(this.config);
    }
  }

  /**
   * Live preview: the 3D card itself, fed with the config being edited and the live states. It does not remember
   * its selection, so the preview never writes to the storage of the real card.
   */
  private _updatePreview(): void {
    const card = this.renderRoot.querySelector<HTMLElement & { setConfig?(c: unknown): void; hass?: unknown }>("detailed-energy-3d-card");
    if (!card) this._previewed = undefined; // a new preview card gets the config again
    if (!card || !this.config || typeof card.setConfig !== "function") return;
    if (this._previewed !== this.config) {
      this._previewed = this.config;
      card.setConfig({ ...this.config, options: { ...this.config.options, remember_selection: false } });
    }
    card.hass = this.hass;
  }

  // ---------- names ----------

  private _isCustom = (r: RoomConfig): boolean => !!this._reg && !this._reg.areas.some((a) => a.area_id === r.area_id);

  /** Display name of a room: the area name, or the own name of a room that is no area. */
  private _roomName = (r: RoomConfig): string =>
    this._isCustom(r) ? r.name || this._tr("custom_room_default") : (this._reg?.areas.find((a) => a.area_id === r.area_id)?.name ?? r.name ?? r.area_id);

  private _floorLabel(f: FloorView): string {
    if (!f.floor_id) return this._tr("house_ed_all_rooms");
    const cfgFloor = this.config?.floors?.find((x) => x.floor_id === f.floor_id);
    const known = this._reg?.floors.find((x) => x.floor_id === f.floor_id);
    if (known) return known.name;
    return (this._reg ? cfgFloor?.name : undefined) || (this._reg ? this._tr("custom_floor_default") : f.floor_id);
  }

  // ---------- changes ----------

  private _emit(config: HouseConfig): void {
    this.config = config;
    this._notice = undefined;
    this._errors = {};
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }

  /** The embedded energy editor changed the config (consumers, sources ...): pass it on as ours. */
  private _onInner(ev: CustomEvent): void {
    ev.stopPropagation();
    const incoming = ev.detail.config as HouseConfig;
    const config = withoutClashingLayouts(incoming);
    // switching the floors off would throw the positions of the floor plan away: ask first, and on "no" keep everything
    if (config !== incoming && this.config?.floors && !window.confirm(this._tr("house_ed_confirm_flat"))) {
      this._pushed = undefined; // the embedded editor gets the unchanged config back, so its switch is on again
      this.requestUpdate();
      return;
    }
    this._pushed = config;
    this._emit(config);
  }

  /** ha-form reports the whole flat data object of the grid size fields; apply the changed one. */
  private _onGridForm(ev: CustomEvent): void {
    ev.stopPropagation();
    const cfg = this.config;
    if (!cfg) return;
    const data = ev.detail.value as Record<string, unknown>;
    const cur = gridOf(cfg);
    for (const key of ["cols", "rows"] as const) {
      const value = Number(data[`house.${key}`]);
      if (value === cur[key] || !Number.isFinite(value)) continue;
      const next = withGrid(cfg, key, Math.round(value));
      if (next) this._emit(next);
      else this._notice = this._tr("house_ed_grid_too_small");
      return;
    }
  }

  /** The number fields of the selected room: apply the new position and size if they fit, else say where. */
  private _onLayoutForm(ev: CustomEvent, floor: FloorView, ap: AutoPlacement, room: RoomConfig): void {
    ev.stopPropagation();
    const cfg = this.config;
    if (!cfg || !room.layout) return;
    const data = ev.detail.value as Record<string, unknown>;
    if (typeof data.name === "string" && data.name !== (room.name ?? "")) {
      const name = data.name as string;
      this._emit(this._withRoom(cfg, floor, room.area_id, (r) => ({ ...r, name: name || undefined })));
      return;
    }
    const next = Object.fromEntries((["x", "y", "w", "h"] as const).map((k) => [k, Math.round(Number(data[`layout.${k}`]))])) as unknown as RoomLayout;
    const changed = (["x", "y", "w", "h"] as const).filter((k) => next[k] !== room.layout![k]);
    if (!changed.length) return;
    const result = withRoomLayout(cfg, ap.floor, room.area_id, next);
    if (result) this._emit(withPinnedAuto(result, ap, room.area_id));
    else this._errors = Object.fromEntries(changed.map((k) => [`layout.${k}`, this._tr("house_ed_no_space")]));
  }

  private _withRoom(cfg: HouseConfig, floor: FloorView, areaId: string, fn: (r: RoomConfig) => RoomConfig): HouseConfig {
    const list = floor.rooms.map((r) => (r.area_id === areaId ? fn(r) : r));
    return floor.floor_id
      ? { ...cfg, floors: (cfg.floors ?? []).map((f) => (f.floor_id === floor.floor_id ? { ...f, rooms: list } : f)) }
      : { ...cfg, rooms: list };
  }

  private _onRoomChange(ev: CustomEvent<HouseGridEventMap["room-change"]>, ap: AutoPlacement): void {
    ev.stopPropagation();
    const next = this.config && withRoomLayout(this.config, ap.floor, ev.detail.key, ev.detail.layout);
    if (next) this._emit(withPinnedAuto(next, ap, ev.detail.key));
  }

  private _onRoomAdd(ev: CustomEvent<HouseGridEventMap["room-add"]>, floor: FloorView): void {
    ev.stopPropagation();
    const choices = this._choices(floor);
    this._sel = undefined;
    this._confirm = undefined;
    this._draft = { layout: ev.detail.layout, area: choices[0]?.value ?? CUSTOM_AREA, name: "" };
  }

  private _onRoomSelect(ev: CustomEvent<HouseGridEventMap["room-select"]>): void {
    ev.stopPropagation();
    this._sel = ev.detail.key;
    this._confirm = undefined;
    this._draft = undefined;
  }

  /** Deletes a room; one with consumers or its own meter asks for a second click first. */
  private _delete(floor: FloorView, key: string, ap: AutoPlacement): void {
    const room = floor.rooms.find((r) => r.area_id === key);
    if (!this.config || !room) return;
    if ((room.consumers?.length || room.entity || room.energy_entity) && this._confirm !== key) {
      this._confirm = key;
      return;
    }
    this._confirm = undefined;
    this._sel = undefined;
    this._emit(withPinnedAuto(withoutRoom(this.config, floor, key), ap, key));
  }

  private _onRoomDelete(ev: CustomEvent<HouseGridEventMap["room-delete"]>, floor: FloorView, ap: AutoPlacement): void {
    ev.stopPropagation();
    this._delete(floor, ev.detail.key, ap);
  }

  private _create(floor: FloorView, ap: AutoPlacement): void {
    const d = this._draft;
    if (!this.config || !d) return;
    const name = d.name.trim() || this._tr("custom_room_default");
    const result = withNewRoom(this.config, ap.floor, d.area, d.layout, name);
    if (!result) {
      this._draft = undefined;
      this._notice = this._tr("house_ed_no_space");
      return;
    }
    this._draft = undefined;
    this._emit(withPinnedAuto(result.cfg, ap));
    this._sel = result.area_id;
  }

  /** Puts a room that has no place yet on the first free spot of its floor. */
  private _place(floor: FloorView, ap: AutoPlacement, room: RoomConfig): void {
    if (!this.config) return;
    const { cols, rows } = gridOf(this.config);
    const spot = freeSpot(layoutsOf(ap.floor.rooms), cols, rows);
    if (!spot) {
      this._notice = this._tr("house_ed_floor_full");
      return;
    }
    this._emit(withPinnedAuto(this._withRoom(this.config, floor, room.area_id, (r) => ({ ...r, layout: spot })) as HouseConfig, ap, room.area_id));
    this._sel = room.area_id;
  }

  // ---------- rendering ----------

  /** Areas still free for a new room on this floor, the floor's own first, then the option for a room without area. */
  private _choices(floor: FloorView): Array<{ value: string; label: string }> {
    const areas = areaChoices(this._reg?.areas ?? [], this.config ? usedAreaIds(this.config) : [], floor.floor_id);
    return [...areas, { value: CUSTOM_AREA, label: this._tr("house_ed_area_custom") }];
  }

  private _form(fields: Field[], obj: unknown, data: Record<string, unknown>, onChange: (ev: CustomEvent) => void, extraErrors: Record<string, string> = {}): TemplateResult {
    const states = (this.hass?.states ?? {}) as Record<string, StateLike | undefined>;
    return html`<ha-form
      .hass=${this.hass}
      .data=${data}
      .schema=${toSchema(fields, obj, this._tr)}
      .error=${{ ...fieldErrors(obj, fields, states, getPath, this._tr), ...extraErrors }}
      .computeLabel=${(s: { name: string }) => labelFor(fields, s.name, this._tr)}
      .computeHelper=${(s: { name: string }) => helperFor(fields, s.name, this._tr)}
      @value-changed=${onChange}
    ></ha-form>`;
  }

  private _renderDraft(floor: FloorView, ap: AutoPlacement): TemplateResult {
    const d = this._draft!;
    const tr = this._tr;
    const custom = d.area === CUSTOM_AREA;
    const schema = [
      { name: "area", required: true, selector: { select: { mode: "dropdown", options: this._choices(floor) } } },
      ...(custom ? [{ name: "name", selector: { text: {} } }] : []),
    ];
    return html`<div class="panel">
      <h3>${tr("house_ed_new_room")}</h3>
      <ha-form
        .hass=${this.hass}
        .data=${{ area: d.area, name: d.name }}
        .schema=${schema}
        .computeLabel=${(s: { name: string }) => (s.name === "area" ? tr("house_ed_area") : tr("field_room_name"))}
        @value-changed=${(ev: CustomEvent) => {
          ev.stopPropagation();
          const v = ev.detail.value as { area?: string; name?: string };
          this._draft = { ...d, area: v.area ?? d.area, name: v.name ?? d.name };
        }}
      ></ha-form>
      <button class="add" @click=${() => this._create(floor, ap)}>${tr("house_ed_room_create")}</button>
      <button class="add" @click=${() => (this._draft = undefined)}>${tr("house_ed_cancel")}</button>
    </div>`;
  }

  private _renderRoom(cfg: HouseConfig, floor: FloorView, ap: AutoPlacement, room: RoomConfig): TemplateResult {
    const tr = this._tr;
    const { cols, rows } = gridOf(cfg);
    const custom = this._isCustom(room);
    const fields = houseFields(cols, rows).filter((f) => f.path.startsWith("layout."));
    const nameField: Field[] = custom ? [{ path: "name", selector: { text: {} }, label: "field_room_name", required: true }] : [];
    const all = [...nameField, ...fields];
    const data: Record<string, unknown> = {};
    for (const f of all) data[f.path] = getPath(room, f.path);
    const confirming = this._confirm === room.area_id;
    return html`<div class="panel">
      <div class="row">
        <h3>${tr("house_ed_room_edit")}: ${this._roomName(room)}</h3>
        <button class="danger" @click=${() => this._delete(floor, room.area_id, ap)}>${tr("house_ed_room_delete")}</button>
      </div>
      ${confirming ? html`<div class="warn">⚠ ${tr("house_ed_room_delete_confirm", room.consumers?.length ?? 0)}</div>` : nothing}
      ${this._form(all, room, data, (ev) => this._onLayoutForm(ev, floor, ap, room), this._errors)}
    </div>`;
  }

  protected render(): TemplateResult {
    const cfg = this.config;
    if (!cfg) return html``;
    const tr = this._tr;
    const floors = floorViews(cfg);
    const fi = Math.min(this._floor, floors.length - 1);
    const floor = floors[fi];
    const { cols, rows } = gridOf(cfg);
    const states = (this.hass?.states ?? {}) as Record<string, StateLike | undefined>;
    // rooms without a position are shown where the card puts them (dashed); a change pins them (withPinnedAuto)
    const ap = withAutoLayouts(floor, cols, rows);
    const placed = gridRooms(ap.floor.rooms, this._roomName, states, this.hass?.locale?.language ?? this.hass?.language, ap.keys);
    const selected = ap.floor.rooms.find((r) => r.area_id === this._sel && r.layout);
    const unplaced = unplacedRooms(ap.floor.rooms);
    const problems = validateLayout(cfg);
    const gridData = { "house.cols": cols, "house.rows": rows };
    const gridFields = HOUSE.filter((f) => f.path.startsWith("house."));
    // the energy card sections (general, sources, structure) first, then the grid size, the floor plan and the preview: they are used last
    return html`
      <detailed-energy-card-editor .hass=${this.hass} .sections=${HOUSE_SECTIONS} .generalFields=${HOUSE_GENERAL_FIELDS} @config-changed=${(ev: CustomEvent) => this._onInner(ev)}></detailed-energy-card-editor>
      <section>
        <h3>${tr("house_ed_section_house")}</h3>
        ${this._form(gridFields, cfg, gridData, (ev) => this._onGridForm(ev))}
      </section>
      <section>
        <h3>${tr("house_ed_section_plan")}</h3>
        <div class="tabs" role="group" aria-label=${tr("house_ed_floor_group")}>
          ${floors.map(
            (f, i) => html`<button aria-pressed=${i === fi ? "true" : "false"} @click=${() => {
              this._floor = i;
              this._sel = undefined;
              this._draft = undefined;
              this._confirm = undefined;
            }}>${this._floorLabel(f)}</button>`,
          )}
        </div>
        <div class="hint">${tr("house_ed_plan_hint")}</div>
        <detailed-energy-house-grid
          .language=${this.hass?.locale?.language ?? this.hass?.language}
          .rooms=${placed}
          .cols=${cols}
          .rows=${rows}
          .selected=${selected?.area_id}
          @room-change=${(ev: CustomEvent<HouseGridEventMap["room-change"]>) => this._onRoomChange(ev, ap)}
          @room-add=${(ev: CustomEvent<HouseGridEventMap["room-add"]>) => this._onRoomAdd(ev, floor)}
          @room-delete=${(ev: CustomEvent<HouseGridEventMap["room-delete"]>) => this._onRoomDelete(ev, floor, ap)}
          @room-select=${(ev: CustomEvent<HouseGridEventMap["room-select"]>) => this._onRoomSelect(ev)}
        ></detailed-energy-house-grid>
        ${this._draft
          ? this._renderDraft(floor, ap)
          : selected
            ? this._renderRoom(cfg, floor, ap, selected)
            : html`<div class="hint">${tr("house_ed_room_none")}</div>`}
        ${unplaced.length
          ? html`<div class="panel">
              <h3>${tr("house_ed_unplaced")}</h3>
              ${unplaced.map((r) => html`<button class="add" @click=${() => this._place(floor, ap, r)}>${tr("house_ed_place", this._roomName(r))}</button>`)}
            </div>`
          : nothing}
        ${this._notice ? html`<div class="warn">⚠ ${this._notice}</div>` : nothing}
        ${problems.map((p) => html`<div class="warn">⚠ ${p}</div>`)}
      </section>
      ${this._haPreview
        ? nothing
        : html`<section>
            <h3>${tr("house_ed_section_preview")}</h3>
            <detailed-energy-3d-card></detailed-energy-3d-card>
          </section>`}
    `;
  }
}

defineOnce("detailed-energy-3d-card-editor", DetailedEnergy3DCardEditor);
