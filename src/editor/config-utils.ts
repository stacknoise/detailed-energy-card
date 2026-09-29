import type { EnergyCardConfig, RoomConfig } from "../model/config";

export type Pointer = Array<string | number>;
type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads a dotted path ("options.unit") from a plain object. */
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (!isObj(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

const isEmpty = (v: unknown): boolean => v === undefined || v === "" || v === null;

/**
 * Immutable write of a dotted path. Empty values (undefined, "", null) delete the key,
 * and objects that become empty are removed, so the result matches hand-written YAML.
 */
export function setPath<T extends object>(obj: T, path: string, value: unknown): T {
  const set = (cur: unknown, keys: string[]): unknown => {
    const base: Obj = isObj(cur) ? { ...cur } : {};
    const [head, ...rest] = keys;
    const next = rest.length ? set(base[head], rest) : value;
    if (isEmpty(next) || (isObj(next) && Object.keys(next).length === 0)) delete base[head];
    else base[head] = next;
    return base;
  };
  return set(obj, path.split(".")) as T;
}

/** Immutable update of the value at a pointer like ["floors", 0, "rooms", 1]. */
export function updateIn<T>(root: T, ptr: Pointer, fn: (v: any) => any): T {
  if (ptr.length === 0) return fn(root);
  const [head, ...rest] = ptr;
  const cur = root as any;
  const copy = Array.isArray(cur) ? [...cur] : { ...cur };
  copy[head as any] = updateIn(cur?.[head], rest, fn);
  return copy as T;
}

export function getIn(root: unknown, ptr: Pointer): any {
  return ptr.reduce<any>((cur, k) => cur?.[k], root);
}

export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (to < 0 || to >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[to]] = [copy[to], copy[index]];
  return copy;
}

export function removeItem<T>(list: T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

/** Switches between floors and top-level rooms without losing rooms. */
export function toggleFloors(cfg: EnergyCardConfig, useFloors: boolean): EnergyCardConfig {
  const { floors, rooms, ...rest } = cfg;
  if (useFloors) {
    if (floors?.length) return cfg;
    return { ...rest, floors: [{ name: "EG", rooms: rooms ?? [] }] };
  }
  if (!floors) return cfg;
  const flat: RoomConfig[] = floors.flatMap((f) => f.rooms ?? []);
  return { ...rest, rooms: flat };
}

export interface Duplicate {
  entity: string;
  places: string[];
}

/** Sensors assigned to more than one consumer slot (allowed, but warned about). */
export function findDuplicates(cfg: EnergyCardConfig): Duplicate[] {
  const seen = new Map<string, string[]>();
  const add = (entity: string, place: string) => seen.set(entity, [...(seen.get(entity) ?? []), place]);
  const rooms = (rs: RoomConfig[], prefix: string) =>
    rs.forEach((r) => (r.consumers ?? []).forEach((c) => c.entity && add(c.entity, `${prefix}${r.name}`)));
  rooms(cfg.rooms ?? [], "");
  (cfg.floors ?? []).forEach((f) => rooms(f.rooms ?? [], `${f.name} › `));
  return [...seen].filter(([, p]) => p.length > 1).map(([entity, places]) => ({ entity, places }));
}
