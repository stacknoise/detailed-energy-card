import type { EnergyCardConfig } from "./config";

export interface FloorEntry {
  floor_id: string;
  name: string;
  icon?: string | null;
  level?: number | null;
}
export interface AreaEntry {
  area_id: string;
  name: string;
  icon?: string | null;
  floor_id?: string | null;
}
export interface Registries {
  floors: FloorEntry[];
  areas: AreaEntry[];
}

interface WsHass {
  callWS<T>(msg: { type: string }): Promise<T>;
}

/** The parts of Home Assistant's `hass` object that carry the registries. */
export interface RegistryHass {
  areas?: Record<string, AreaEntry | undefined>;
  /** only in newer frontends (the object is missing in Home Assistant 2024.8 / 2024.9) */
  floors?: Record<string, FloorEntry | undefined>;
  callWS?<T>(msg: { type: string }): Promise<T>;
}

const present = <T>(o: Record<string, T | undefined>): T[] => Object.values(o).filter((v): v is T => !!v);

/** Loads the floor and area registry of Home Assistant. */
export async function loadRegistries(hass: WsHass): Promise<Registries> {
  const [floors, areas] = await Promise.all([
    hass.callWS<FloorEntry[]>({ type: "config/floor_registry/list" }),
    hass.callWS<AreaEntry[]>({ type: "config/area_registry/list" }),
  ]);
  return { floors, areas };
}

/** Fills name and icon of floors and rooms from the registries (ids stay the source of truth). */
export function resolveNames(cfg: EnergyCardConfig, reg: Registries): EnergyCardConfig {
  const area = (id: string) => reg.areas.find((a) => a.area_id === id);
  const floor = (id: string) => reg.floors.find((f) => f.floor_id === id);
  const room = <R extends { area_id: string; icon?: string }>(r: R) => ({
    ...r,
    name: area(r.area_id)?.name ?? r.area_id,
    icon: r.icon ?? area(r.area_id)?.icon ?? undefined,
  });
  return {
    ...cfg,
    rooms: cfg.rooms?.map(room),
    floors: cfg.floors?.map((f) => ({
      ...f,
      name: floor(f.floor_id)?.name ?? f.floor_id,
      icon: f.icon ?? floor(f.floor_id)?.icon ?? undefined,
      rooms: f.rooms?.map(room),
    })),
  };
}

/** Wait before asking again after a failed load, so a broken connection is not hammered. */
export const RETRY_AFTER_MS = 30_000;

/**
 * Gives the floor and area registries to a card or editor.
 *
 * Home Assistant keeps both up to date in `hass.areas` / `hass.floors`, so they are used
 * directly: no request, and a renamed area shows up without reloading the page. Older
 * frontends have no `hass.floors`; then both registries are loaded once over the WebSocket,
 * and a failed load is retried at most every {@link RETRY_AFTER_MS}.
 */
export class RegistrySource {
  private _ws?: Registries;
  private _loading = false;
  private _retryAt = 0;
  private _memo?: { areas: object; floors: object; reg: Registries };

  /** `onLoaded` runs when a WebSocket load finishes, so the owner can render again. */
  constructor(
    private readonly _onLoaded: () => void,
    private readonly _now: () => number = Date.now,
  ) {}

  /** The registries right now, or undefined while they are not available yet. */
  get(hass: RegistryHass | undefined): Registries | undefined {
    const { areas, floors } = hass ?? {};
    if (areas && floors) {
      if (this._memo?.areas !== areas || this._memo.floors !== floors) {
        this._memo = { areas, floors, reg: { areas: present(areas), floors: present(floors) } };
      }
      return this._memo.reg;
    }
    return this._ws;
  }

  /** Starts the WebSocket fallback if the registries are neither in `hass` nor loaded yet. */
  ensure(hass: RegistryHass | undefined): void {
    if (!hass?.callWS || this.get(hass) || this._loading || this._now() < this._retryAt) return;
    this._loading = true;
    loadRegistries(hass as WsHass)
      .then((reg) => {
        this._ws = reg;
        this._onLoaded();
      })
      .catch(() => {
        this._retryAt = this._now() + RETRY_AFTER_MS;
      })
      .finally(() => (this._loading = false));
  }
}
