export type SourceType = "solar" | "battery" | "grid" | "generic";

export interface SourceConfig {
  entity: string;
  name?: string;
  type?: SourceType;
  icon?: string;
  color?: string;
  soc_entity?: string;
  invert?: boolean;
}

export interface ConsumerConfig {
  entity: string;
  name?: string;
}

export interface RoomConfig {
  name: string;
  icon?: string;
  color?: string;
  consumers?: ConsumerConfig[];
}

export interface FloorConfig {
  name: string;
  icon?: string;
  color?: string;
  rooms?: RoomConfig[];
}

export interface ColorsConfig {
  preset?: "theme" | "nocturne" | "custom";
  accent?: string;
  flow?: string;
  inactive?: string;
  bar?: string;
  background?: string;
  text?: string;
}

export interface OptionsConfig {
  unit?: "auto" | "W" | "kW";
  decimals?: number;
  animation?: boolean;
  show_unassigned?: boolean;
  remember_selection?: boolean;
}

export interface EnergyCardConfig {
  type: string;
  title?: string;
  home?: { name?: string; total_entity?: string };
  sources?: SourceConfig[];
  floors?: FloorConfig[];
  rooms?: RoomConfig[];
  colors?: ColorsConfig;
  options?: OptionsConfig;
}

const SOURCE_TYPES: SourceType[] = ["solar", "battery", "grid", "generic"];

export class ConfigError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function checkEntity(id: unknown, where: string): void {
  if (typeof id !== "string" || !/^sensor\.[a-z0-9_]+$/.test(id)) {
    throw new ConfigError(`${where}: "${String(id)}" is not a sensor entity (sensor.*)`);
  }
}

function checkRoom(room: unknown, where: string): void {
  if (!isObj(room) || typeof room.name !== "string" || !room.name) {
    throw new ConfigError(`${where}: room needs a name`);
  }
  const consumers = room.consumers ?? [];
  if (!Array.isArray(consumers)) throw new ConfigError(`${where}: consumers must be a list`);
  consumers.forEach((c, i) => checkEntity(isObj(c) ? c.entity : undefined, `${where}.consumers[${i}]`));
}

/** Validates a raw Lovelace config; throws ConfigError with a readable message. */
export function validateConfig(raw: unknown): EnergyCardConfig {
  if (!isObj(raw)) throw new ConfigError("Invalid configuration");
  const cfg = raw as unknown as EnergyCardConfig;

  if (cfg.floors?.length && cfg.rooms?.length) {
    throw new ConfigError("Use either `floors` or `rooms` on the top level, not both");
  }
  if (cfg.home?.total_entity) checkEntity(cfg.home.total_entity, "home.total_entity");

  (cfg.sources ?? []).forEach((s, i) => {
    checkEntity(s?.entity, `sources[${i}].entity`);
    if (s.type && !SOURCE_TYPES.includes(s.type)) {
      throw new ConfigError(`sources[${i}].type: unknown type "${s.type}"`);
    }
    if (s.soc_entity) checkEntity(s.soc_entity, `sources[${i}].soc_entity`);
  });
  (cfg.floors ?? []).forEach((f, i) => {
    if (!isObj(f) || typeof f.name !== "string" || !f.name) {
      throw new ConfigError(`floors[${i}]: floor needs a name`);
    }
    (f.rooms ?? []).forEach((r, j) => checkRoom(r, `floors[${i}].rooms[${j}]`));
  });
  (cfg.rooms ?? []).forEach((r, i) => checkRoom(r, `rooms[${i}]`));
  return cfg;
}

/** All entity ids referenced by the config (used to limit re-renders). */
export function collectEntityIds(cfg: EnergyCardConfig): string[] {
  const ids = new Set<string>();
  if (cfg.home?.total_entity) ids.add(cfg.home.total_entity);
  for (const s of cfg.sources ?? []) {
    ids.add(s.entity);
    if (s.soc_entity) ids.add(s.soc_entity);
  }
  const rooms = [...(cfg.rooms ?? []), ...(cfg.floors ?? []).flatMap((f) => f.rooms ?? [])];
  for (const r of rooms) for (const c of r.consumers ?? []) ids.add(c.entity);
  return [...ids];
}
