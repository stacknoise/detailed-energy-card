import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { EnergyCardConfig, FloorConfig, RoomConfig, SourceConfig } from "../model/config";
import {
  findDuplicates,
  getIn,
  getPath,
  moveItem,
  removeItem,
  setPath,
  toggleFloors,
  updateIn,
  type Pointer,
} from "./config-utils";
import {
  COLORS,
  CONSUMER,
  GENERAL,
  HOME,
  SOURCE,
  floorFields,
  labelFor,
  roomFields,
  toSchema,
  type Choice,
  type Field,
} from "./schema";
import { loadRegistries, type Registries } from "../model/registry";

interface Hass {
  states: Record<string, unknown>;
  callWS<T>(msg: { type: string }): Promise<T>;
  [k: string]: unknown;
}

/** Visual editor: every config option has a field (see schema.ts and the coverage test). */
@customElement("energy-card-editor")
export class EnergyCardEditor extends LitElement {
  @property({ attribute: false }) hass?: Hass;
  @state() private _config?: EnergyCardConfig;
  /** open state of collapsible tree/source items, keyed by pointer */
  @state() private _open = new Set<string>();

  @state() private _reg?: Registries;
  private _regLoading = false;

  setConfig(config: EnergyCardConfig): void {
    this._config = config;
  }

  protected willUpdate(): void {
    if (this._reg || this._regLoading || !this.hass?.callWS) return;
    this._regLoading = true;
    loadRegistries(this.hass)
      .then((reg) => (this._reg = reg))
      .catch(() => undefined)
      .finally(() => (this._regLoading = false));
  }

  // ---------- Home Assistant floors and areas (the only allowed choices) ----------

  private _usedFloorIds(): string[] {
    return (this._config?.floors ?? []).map((f) => f.floor_id);
  }

  private _usedAreaIds(): string[] {
    const c = this._config;
    return [...(c?.rooms ?? []), ...(c?.floors ?? []).flatMap((f) => f.rooms ?? [])].map((r) => r.area_id);
  }

  private _floorChoices(current: string): Choice[] {
    const used = this._usedFloorIds();
    return (this._reg?.floors ?? [])
      .filter((f) => f.floor_id === current || !used.includes(f.floor_id))
      .map((f) => ({ value: f.floor_id, label: f.name }));
  }

  /** Areas that may still be added to a list; on a floor only that floor's areas. */
  private _areaOptions(floorId: string | undefined, current = ""): Choice[] {
    const used = this._usedAreaIds();
    return (this._reg?.areas ?? [])
      .filter(
        (a) => (floorId === undefined || a.floor_id === floorId) && (a.area_id === current || !used.includes(a.area_id)),
      )
      .map((a) => ({ value: a.area_id, label: a.name }));
  }

  private _floorName = (id: string) => this._reg?.floors.find((f) => f.floor_id === id)?.name ?? id;
  private _areaName = (id: string) => this._reg?.areas.find((a) => a.area_id === id)?.name ?? id;

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
    .item {
      border: 1px solid var(--divider-color, #3f424d);
      border-radius: 8px;
      margin: 8px 0;
      padding: 0 8px;
    }
    .item.nested {
      margin-left: 12px;
    }
    .head {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 0;
    }
    .head .title {
      flex: 1;
      background: none;
      border: none;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
      padding: 4px 0;
    }
    .head .title small {
      color: var(--secondary-text-color);
      margin-left: 8px;
    }
    button.icon {
      background: none;
      border: none;
      color: var(--secondary-text-color);
      cursor: pointer;
      font-size: 1.1em;
      padding: 2px 6px;
    }
    button.icon:disabled {
      opacity: 0.3;
      cursor: default;
    }
    button.add {
      background: none;
      border: 1px dashed var(--divider-color, #3f424d);
      border-radius: 8px;
      color: var(--primary-color);
      cursor: pointer;
      font: inherit;
      margin: 8px 0;
      padding: 6px 12px;
    }
    .warn {
      color: var(--warning-color, #ffa600);
      font-size: 0.9em;
      margin: 4px 0;
    }
    ha-form {
      display: block;
    }
  `;

  // ---------- config mutation ----------

  private _emit(config: EnergyCardConfig): void {
    this._config = config;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }

  private _update(ptr: Pointer, fn: (v: any) => any): void {
    if (this._config) this._emit(updateIn(this._config, ptr, fn));
  }

  /** ha-form reports the whole flat data object; apply only the changed fields. */
  private _onForm(ptr: Pointer, fields: Field[], ev: CustomEvent): void {
    ev.stopPropagation();
    const data = ev.detail.value as Record<string, unknown>;
    this._update(ptr, (obj: object) => {
      let next = obj ?? {};
      for (const f of fields) {
        if (!(f.path in data) && getPath(next, f.path) === undefined) continue;
        if (data[f.path] !== getPath(next, f.path)) next = setPath(next, f.path, data[f.path]);
      }
      return next;
    });
  }

  private _toggleOpen(key: string): void {
    const open = new Set(this._open);
    open.has(key) ? open.delete(key) : open.add(key);
    this._open = open;
  }

  // ---------- rendering ----------

  private _form(ptr: Pointer, fields: Field[]): TemplateResult {
    const obj = ptr.length ? getIn(this._config, ptr) : this._config;
    const data: Record<string, unknown> = {};
    for (const f of fields) data[f.path] = getPath(obj, f.path);
    return html`<ha-form
      .hass=${this.hass}
      .data=${data}
      .schema=${toSchema(fields, obj)}
      .computeLabel=${(s: { name: string }) => labelFor(fields, s.name)}
      @value-changed=${(ev: CustomEvent) => this._onForm(ptr, fields, ev)}
    ></ha-form>`;
  }

  private _itemHead(key: string, title: string, sub: string, ptr: Pointer, index: number, count: number): TemplateResult {
    const listPtr = ptr.slice(0, -1);
    return html`<div class="head">
      <button class="title" @click=${() => this._toggleOpen(key)}>
        ${this._open.has(key) ? "▾" : "▸"} ${title}<small>${sub}</small>
      </button>
      <button class="icon" title="Nach oben" ?disabled=${index === 0}
        @click=${() => this._update(listPtr, (l) => moveItem(l, index, -1))}>↑</button>
      <button class="icon" title="Nach unten" ?disabled=${index === count - 1}
        @click=${() => this._update(listPtr, (l) => moveItem(l, index, 1))}>↓</button>
      <button class="icon" title="Entfernen"
        @click=${() => this._update(listPtr, (l) => removeItem(l, index))}>✕</button>
    </div>`;
  }

  private _renderSources(): TemplateResult {
    const sources = this._config?.sources ?? [];
    return html`
      <section>
        <h3>Stromquellen (${sources.length})</h3>
        ${sources.map((s: SourceConfig, i) => {
          const ptr: Pointer = ["sources", i];
          const key = `s${i}`;
          return html`<div class="item">
            ${this._itemHead(key, s.name ?? s.type ?? "Quelle", s.entity ?? "", ptr, i, sources.length)}
            ${this._open.has(key) ? this._form(ptr, SOURCE) : nothing}
          </div>`;
        })}
        <button class="add" @click=${() => this._addSource()}>+ Quelle hinzufügen</button>
      </section>
    `;
  }

  private _addSource(): void {
    this._open = new Set(this._open).add(`s${this._config?.sources?.length ?? 0}`);
    this._update(["sources"], (l) => [...(l ?? []), { entity: "", type: "generic" }]);
  }

  private _renderConsumers(roomPtr: Pointer): TemplateResult {
    const consumers = getIn(this._config, [...roomPtr, "consumers"]) ?? [];
    return html`
      <h3>Verbraucher (${consumers.length})</h3>
      ${consumers.map((_c: unknown, i: number) => {
        const ptr: Pointer = [...roomPtr, "consumers", i];
        return html`<div class="item">
          <div class="head">
            <div class="title" style="flex:1">${this._form(ptr, CONSUMER)}</div>
            <button class="icon" ?disabled=${i === 0}
              @click=${() => this._update([...roomPtr, "consumers"], (l) => moveItem(l, i, -1))}>↑</button>
            <button class="icon" ?disabled=${i === consumers.length - 1}
              @click=${() => this._update([...roomPtr, "consumers"], (l) => moveItem(l, i, 1))}>↓</button>
            <button class="icon" title="Entfernen"
              @click=${() => this._update([...roomPtr, "consumers"], (l) => removeItem(l, i))}>✕</button>
          </div>
        </div>`;
      })}
      <button class="add"
        @click=${() => this._update([...roomPtr, "consumers"], (l) => [...(l ?? []), { entity: "" }])}>
        + Verbraucher
      </button>
    `;
  }

  private _renderRooms(listPtr: Pointer, nested: boolean, floorId?: string): TemplateResult {
    const rooms: RoomConfig[] = getIn(this._config, listPtr) ?? [];
    const free = this._areaOptions(floorId);
    return html`
      ${rooms.map((r, i) => {
        const ptr: Pointer = [...listPtr, i];
        const key = ptr.join(".");
        return html`<div class="item ${nested ? "nested" : ""}">
          ${this._itemHead(key, this._areaName(r.area_id), `${r.consumers?.length ?? 0} Verbraucher`, ptr, i, rooms.length)}
          ${this._open.has(key)
            ? html`${this._form(ptr, roomFields(this._areaOptions(floorId, r.area_id)))}${this._renderConsumers(ptr)}`
            : nothing}
        </div>`;
      })}
      <button class="add" ?disabled=${!free.length} @click=${() => this._addRoom(listPtr, free[0].value)}>+ Raum</button>
      ${this._reg && !free.length
        ? html`<div class="warn">Keine weiteren Bereiche in Home Assistant verfügbar.</div>`
        : nothing}
    `;
  }

  private _addRoom(listPtr: Pointer, areaId: string): void {
    const n = (getIn(this._config, listPtr) ?? []).length;
    this._open = new Set(this._open).add([...listPtr, n].join("."));
    this._update(listPtr, (l) => [...(l ?? []), { area_id: areaId, consumers: [] }]);
  }

  private _renderStructure(): TemplateResult {
    const cfg = this._config;
    const useFloors = !!cfg?.floors;
    const floors: FloorConfig[] = cfg?.floors ?? [];
    const freeFloors = this._floorChoices("");
    return html`
      <section>
        <h3>Struktur</h3>
        <ha-formfield label="Etagen verwenden">
          <ha-switch
            .checked=${useFloors}
            @change=${(ev: Event) => this._emit(toggleFloors(cfg!, (ev.target as HTMLInputElement).checked, this._reg?.areas))}
          ></ha-switch>
        </ha-formfield>
        ${useFloors
          ? html`
              ${floors.map((f, i) => {
                const ptr: Pointer = ["floors", i];
                const key = ptr.join(".");
                return html`<div class="item">
                  ${this._itemHead(key, this._floorName(f.floor_id), `${f.rooms?.length ?? 0} Räume`, ptr, i, floors.length)}
                  ${this._open.has(key)
                    ? html`${this._form(ptr, floorFields(this._floorChoices(f.floor_id)))}${this._renderRooms([...ptr, "rooms"], true, f.floor_id)}`
                    : nothing}
                </div>`;
              })}
              <button class="add" ?disabled=${!freeFloors.length}
                @click=${() => this._update(["floors"], (l) => [...(l ?? []), { floor_id: freeFloors[0].value, rooms: [] }])}>
                + Etage
              </button>
              ${this._reg && !freeFloors.length
                ? html`<div class="warn">Keine weiteren Etagen in Home Assistant angelegt.</div>`
                : nothing}`
          : this._renderRooms(["rooms"], false)}
      </section>
    `;
  }

  protected render(): TemplateResult {
    if (!this._config) return html``;
    const dups = findDuplicates(this._config);
    return html`
      <section><h3>Allgemein</h3>${this._form([], GENERAL)}</section>
      <section><h3>Farben</h3>${this._form([], COLORS)}</section>
      <section><h3>Zuhause</h3>${this._form([], HOME)}</section>
      ${this._renderSources()} ${this._renderStructure()}
      ${dups.map(
        (d) => html`<div class="warn">⚠ ${d.entity} ist mehrfach zugeordnet: ${d.places.join(", ")}</div>`,
      )}
    `;
  }
}
