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
