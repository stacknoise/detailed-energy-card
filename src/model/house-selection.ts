import type { ActionConfig, NodeActions } from "./actions";
import type { EnergyCardConfig } from "./config";
import { listRemainder, listedConsumers, type ConsumerNode, type EnergyModel, type FloorNode, type Remainder, type RoomNode, type SourceNode } from "./compute";
import { HOUSE_STORAGE_PREFIX, type HouseSelection } from "./house";

/** Prefix of the stored selection of the 3D card; below `HOUSE_STORAGE_PREFIX`, so `removeLegacyKeys` of the energy card never touches it. */
export const HOUSE_SELECTION_PREFIX = `${HOUSE_STORAGE_PREFIX}sel1:`;

/**
 * Storage key of a 3D card: from the floor and area ids only (like `selectionKey` of the energy card), so renaming or
 * recoloring keeps the remembered selection. Cards with the same structure are told apart by `options.storage_id`.
 */
export function houseSelectionKey(cfg: EnergyCardConfig | undefined): string {
  const ids = {
    f: (cfg?.floors ?? []).map((f) => [f.floor_id, (f.rooms ?? []).map((r) => r.area_id)]),
    r: (cfg?.rooms ?? []).map((r) => r.area_id),
  };
  return `${HOUSE_SELECTION_PREFIX}${encodeURIComponent(cfg?.options?.storage_id ?? "")}:${JSON.stringify(ids)}`;
}

/** Reads a stored value defensively: anything that is not the expected shape counts as "nothing selected". */
export function parseHouseSelection(raw: string | null): HouseSelection {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
    const o = v as Record<string, unknown>;
    const sel: HouseSelection = {};
    if (typeof o.floor_id === "string") sel.floor_id = o.floor_id;
    if (typeof o.area_id === "string") sel.area_id = o.area_id;
    if (typeof o.source === "string") sel.source = o.source;
    return sel;
  } catch {
    return {};
  }
}

/**
 * The selection as the scene builder gets it: ids that are not in the model are dropped, and a room carries the floor it
 * is on (`{ floor_id, area_id }`), so a stored room of a floor that was removed does not stay selected.
 */
export function resolveHouseSelection(model: EnergyModel | undefined, sel: HouseSelection): HouseSelection {
  if (!model) return {};
  if (sel.source !== undefined && model.sources.some((s) => s.entity === sel.source)) return { source: sel.source };
  if (sel.area_id !== undefined) {
    for (const f of model.floors) if (f.rooms.some((r) => r.id === sel.area_id)) return { floor_id: f.id, area_id: sel.area_id };
    if (model.rooms.some((r) => r.id === sel.area_id)) return { area_id: sel.area_id };
  }
  if (sel.floor_id !== undefined && model.floors.some((f) => f.id === sel.floor_id)) return { floor_id: sel.floor_id };
  return {};
}

/** Tap on a floor or room: select it, a second tap on the selected one clears it. A room keeps its floor, a floor drops the room. */
export function toggleHouseSelection(model: EnergyModel | undefined, current: HouseSelection, target: HouseSelection): HouseSelection {
  const now = resolveHouseSelection(model, current);
  const next = resolveHouseSelection(model, target);
  if (target.source !== undefined) return next.source === undefined || now.source === next.source ? {} : next;
  if (next.area_id !== undefined) return now.area_id === next.area_id ? (next.floor_id ? { floor_id: next.floor_id } : {}) : next;
  if (next.floor_id !== undefined) return now.floor_id === next.floor_id && now.area_id === undefined ? {} : next;
  return {};
}

/** The power source a (resolved) selection points at. */
export function selectedSource(model: EnergyModel | undefined, sel: HouseSelection): SourceNode | undefined {
  return model?.sources.find((s) => s.entity === sel.source);
}

/** The floor and the room a (resolved) selection points at. */
export function selectedNodes(model: EnergyModel | undefined, sel: HouseSelection): { floor?: FloorNode; room?: RoomNode } {
  if (!model) return {};
  const floor = model.floors.find((f) => f.id === sel.floor_id);
  const room = sel.area_id === undefined ? undefined : (floor ? floor.rooms : model.rooms).find((r) => r.id === sel.area_id);
  return { floor, room };
}

/** The actions a floor or room names in the config; undefined when it names none (the tap then selects). */
export function houseActionsOf(model: EnergyModel | undefined, target: HouseSelection): NodeActions | undefined {
  if (!model) return undefined;
  const resolved = resolveHouseSelection(model, target);
  if (resolved.source !== undefined) return selectedSource(model, resolved)?.actions;
  const { floor, room } = selectedNodes(model, resolved);
  return (room ?? floor)?.actions;
}

/**
 * The hold or double tap action that runs on a floor or room: its own, and a room without one takes that of its floor
 * (the rooms cover most of the floor slab, so a floor action would hardly be reachable otherwise). The tap is not
 * inherited: it selects the room.
 */
export function houseGestureOf(model: EnergyModel | undefined, target: HouseSelection, kind: "hold" | "double"): { action: ActionConfig; entity?: string } | undefined {
  if (!model) return undefined;
  const resolved = resolveHouseSelection(model, target);
  const { floor, room } = selectedNodes(model, resolved);
  for (const node of [room, floor, selectedSource(model, resolved)]) {
    const action = node?.actions?.[kind];
    if (action) return action.action === "none" ? undefined : { action, entity: node?.actions?.entity }; // an own "none" turns it off
  }
  return undefined;
}

/** One line of the detail list below the graphic. */
export type HouseDetailRow =
  | { kind: "floor"; key: string; id: string; name: string; watts: number; icon?: string }
  | { kind: "room"; key: string; id: string; floor_id?: string; name: string; watts: number; icon?: string }
  | { kind: "consumer"; key: string; consumer: ConsumerNode; watts: number }
  | { kind: "remainder"; key: string; remainder: Remainder };

/** What the detail list shows: a head (name and value of the selected part, or the home) and the rows. */
export interface HouseDetail {
  scope: "home" | "floor" | "room" | "source";
  name?: string;
  icon?: string;
  watts: number;
  rows: HouseDetailRow[];
  /** consumers in the list / all consumers of the shown part (differ with `only_active_consumers`) */
  shown: number;
  total: number;
}

const byWatts = <T extends { watts: number }>(a: T, b: T) => b.watts - a.watts;

/**
 * The detail of a selected power source: where its power goes. The card does not know which source feeds which floor, so
 * the split is proportional (the share of the source of all producing sources), as in the Sankey diagram. A source that
 * consumes (a charging battery, grid export) has no distribution.
 */
function sourceDetail(model: EnergyModel, source: SourceNode): HouseDetail {
  const part = source.reverse ? 0 : source.share;
  const byFloor = model.floors.length > 0;
  const rows = (byFloor ? model.floors : model.rooms)
    .map((n): Extract<HouseDetailRow, { kind: "floor" | "room" }> => (byFloor ? { kind: "floor", key: "f:" + n.id, id: n.id, name: n.name, watts: n.watts * part, icon: n.icon } : { kind: "room", key: "r:" + n.id, id: n.id, name: n.name, watts: n.watts * part, icon: n.icon }))
    .filter((r) => r.watts > 0)
    .sort(byWatts);
  return { scope: "source", name: source.name, icon: source.icon, watts: Math.abs(source.watts), rows, shown: 0, total: 0 };
}

/**
 * The detail list for a selection, the textual twin of the graphic: a room shows its consumers, a floor its rooms, the
 * whole home its floors (or rooms) and the consumers outside any room. Sorted by power, the "unassigned" row at the end.
 */
export function houseDetail(model: EnergyModel, sel: HouseSelection, onlyActive: boolean): HouseDetail {
  const resolved = resolveHouseSelection(model, sel);
  const source = selectedSource(model, resolved);
  if (source) return sourceDetail(model, source);
  const { floor, room } = selectedNodes(model, resolved);
  if (room) {
    const consumers = listedConsumers(room.consumers, onlyActive);
    const rows: HouseDetailRow[] = [...consumers].sort(byWatts).map((c) => ({ kind: "consumer", key: `c:${c.entity}`, consumer: c, watts: c.watts }));
    const rest = listRemainder(model, undefined, room);
    if (rest) rows.push({ kind: "remainder", key: "rest", remainder: rest });
    return { scope: "room", name: room.name, icon: room.icon, watts: room.watts, rows, shown: consumers.length, total: room.consumers.length };
  }
  if (floor) {
    const rows: HouseDetailRow[] = [...floor.rooms]
      .sort(byWatts)
      .map((r) => ({ kind: "room", key: `r:${r.id}`, id: r.id, floor_id: floor.id, name: r.name, watts: r.watts, icon: r.icon }));
    const rest = listRemainder(model, floor);
    if (rest) rows.push({ kind: "remainder", key: "rest", remainder: rest });
    const n = floor.rooms.reduce((s, r) => s + r.consumers.length, 0);
    return { scope: "floor", name: floor.name, icon: floor.icon, watts: floor.watts, rows, shown: n, total: n };
  }
  const rows: HouseDetailRow[] = model.floors.length
    ? [...model.floors].sort(byWatts).map((f) => ({ kind: "floor", key: `f:${f.id}`, id: f.id, name: f.name, watts: f.watts, icon: f.icon }))
    : [...model.rooms].sort(byWatts).map((r) => ({ kind: "room", key: `r:${r.id}`, id: r.id, name: r.name, watts: r.watts, icon: r.icon }));
  const direct = listedConsumers(model.consumers, onlyActive);
  for (const c of [...direct].sort(byWatts)) rows.push({ kind: "consumer", key: `c:${c.entity}`, consumer: c, watts: c.watts });
  const rest = listRemainder(model);
  if (rest) rows.push({ kind: "remainder", key: "rest", remainder: rest });
  const n = direct.length;
  return { scope: "home", watts: model.homeWatts, rows, shown: n, total: model.consumers.length };
}
