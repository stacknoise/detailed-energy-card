import type { EnergyCardConfig } from "./config";

export interface Selection {
  /** floor_id; undefined = default (largest floor), null = explicitly none selected, i.e. all floors */
  floor?: string | null;
  /** area_id of one room; undefined / null select all rooms of the row */
  room?: string | null;
}

export const STORAGE_PREFIX = "detailed-energy-card:";
const KEY_PREFIX = `${STORAGE_PREFIX}sel:`;

const hashOf = (s: string): string => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

/**
 * Storage key of a card: derived from the floor and area ids only, so changing colors, names or
 * consumers keeps the remembered selection, while two cards with different structure stay apart.
 */
export function selectionKey(cfg: EnergyCardConfig | undefined): string {
  const ids = {
    f: (cfg?.floors ?? []).map((f) => [f.floor_id, (f.rooms ?? []).map((r) => r.area_id)]),
    r: (cfg?.rooms ?? []).map((r) => r.area_id),
  };
  return `${KEY_PREFIX}${hashOf(JSON.stringify(ids))}`;
}

const idOrNull = (v: unknown): string | null | undefined =>
  v === null ? null : typeof v === "string" ? v : undefined;

/** Reads a stored value defensively: anything that is not the expected shape counts as "no selection". */
export function parseSelection(raw: string | null): Selection {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
    const o = v as Record<string, unknown>;
    const sel: Selection = {};
    const floor = idOrNull(o.floor);
    const room = idOrNull(o.room);
    if (floor !== undefined) sel.floor = floor;
    if (room !== undefined) sel.room = room;
    return sel;
  } catch {
    return {};
  }
}

/** Removes keys of the old format (selection by name, key from the whole config). */
export function removeLegacyKeys(storage: Pick<Storage, "length" | "key" | "removeItem">): void {
  const stale: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith(STORAGE_PREFIX) && !k.startsWith(KEY_PREFIX)) stale.push(k);
  }
  for (const k of stale) storage.removeItem(k);
}
