import type { EnergyCardConfig, RoomConfig, SourceType } from "./config";

export interface Reading {
  watts: number;
  valid: boolean;
}
export type Reader = (entityId: string) => Reading;

export interface ConsumerNode {
  entity: string;
  name?: string;
  watts: number;
  valid: boolean;
}
export interface RoomNode {
  name: string;
  icon?: string;
  color?: string;
  watts: number;
  consumers: ConsumerNode[];
}
export interface FloorNode {
  name: string;
  icon?: string;
  color?: string;
  watts: number;
  rooms: RoomNode[];
}
export interface SourceNode {
  entity: string;
  name: string;
  type: SourceType;
  icon?: string;
  color?: string;
  /** signed watts after `invert`; solar/generic are clipped at 0 */
  watts: number;
  valid: boolean;
  /** true while the source consumes power (battery charging, grid export) */
  reverse: boolean;
  /** share of all producing sources, 0..1 */
  share: number;
  /** state of charge in percent (battery) */
  soc?: number;
}
export interface EnergyModel {
  sources: SourceNode[];
  floors: FloorNode[];
  /** rooms directly under home (no floors configured) */
  rooms: RoomNode[];
  homeWatts: number;
  unassigned: number;
  /** 0..1, null when home consumption is zero */
  autarky: number | null;
  totalValid: boolean;
}

const DEFAULT_NAMES: Record<SourceType, string> = {
  solar: "PV",
  battery: "Batterie",
  grid: "Netz",
  generic: "Quelle",
};

function computeRoom(room: RoomConfig, read: Reader): RoomNode {
  const consumers = (room.consumers ?? []).map((c) => {
    const r = read(c.entity);
    return { entity: c.entity, name: c.name, watts: r.valid ? Math.max(0, r.watts) : 0, valid: r.valid };
  });
  return {
    name: room.name ?? room.area_id,
    icon: room.icon,
    color: room.color,
    watts: consumers.reduce((s, c) => s + c.watts, 0),
    consumers,
  };
}

export function computeModel(cfg: EnergyCardConfig, read: Reader): EnergyModel {
  const sources: SourceNode[] = (cfg.sources ?? []).map((s) => {
    const type = s.type ?? "generic";
    const r = read(s.entity);
    let watts = r.valid ? r.watts : 0;
    if (s.invert) watts = -watts;
    if (type === "solar" || type === "generic") watts = Math.max(0, watts);
    const soc = s.soc_entity ? read(s.soc_entity) : undefined;
    return {
      entity: s.entity,
      name: s.name ?? DEFAULT_NAMES[type],
      type,
      icon: s.icon,
      color: s.color,
      watts,
      valid: r.valid,
      reverse: watts < 0,
      share: 0,
      soc: soc?.valid ? soc.watts : undefined,
    };
  });

  const produced = sources.reduce((sum, s) => sum + Math.max(0, s.watts), 0);
  for (const s of sources) s.share = produced > 0 ? Math.max(0, s.watts) / produced : 0;

  const floors: FloorNode[] = (cfg.floors ?? []).map((f) => {
    const rooms = (f.rooms ?? []).map((r) => computeRoom(r, read));
    return { name: f.name ?? f.floor_id, icon: f.icon, color: f.color, watts: rooms.reduce((s, r) => s + r.watts, 0), rooms };
  });
  const rooms = (cfg.rooms ?? []).map((r) => computeRoom(r, read));

  const roomSum = floors.length
    ? floors.reduce((s, f) => s + f.watts, 0)
    : rooms.reduce((s, r) => s + r.watts, 0);

  const total = cfg.home?.total_entity ? read(cfg.home.total_entity) : undefined;
  const totalValid = !!total?.valid;
  const homeWatts = totalValid ? Math.max(0, total!.watts) : roomSum;
  const unassigned = totalValid ? Math.max(0, homeWatts - roomSum) : 0;

  const gridImport = sources
    .filter((s) => s.type === "grid")
    .reduce((sum, s) => sum + Math.max(0, s.watts), 0);
  const autarky = homeWatts > 0 ? Math.min(1, Math.max(0, 1 - gridImport / homeWatts)) : null;

  return { sources, floors, rooms, homeWatts, unassigned, autarky, totalValid };
}
