import type { EnergyCardConfig, RoomConfig, SourceType } from "./config";
import { isIdle, type ThresholdConfig } from "./thresholds";

export interface Reading {
  watts: number;
  valid: boolean;
}
export type Reader = (entityId: string) => Reading;

export interface ConsumerNode {
  entity: string;
  name?: string;
  /** watts, or watt hours in the energy mode */
  watts: number;
  valid: boolean;
  /** energy mode: the consumer has no energy sensor */
  noEnergy?: boolean;
  /** power mode: the consumer has no power sensor, only an energy counter */
  noPower?: boolean;
  /** own thresholds from the config, replace the level thresholds */
  thresholds?: ThresholdConfig[];
}
/** Consumers the list shows: with `onlyActive` the ones at rest (under 1 W) are left out, unreadable sensors stay as warnings. */
export function listedConsumers(consumers: ConsumerNode[], onlyActive: boolean): ConsumerNode[] {
  return onlyActive ? consumers.filter((c) => !c.noPower && (!c.valid || !isIdle(c.watts))) : consumers;
}

/** What the own meter of a room or a floor says about it (absent without a meter for the shown mode). */
export interface MeterInfo {
  /** the value comes from the meter */
  metered: boolean;
  /** the meter is configured but cannot be read: the node shows the sum of its children instead */
  invalid?: boolean;
  /** metered value minus the sum of the children, 0 or more */
  unassigned: number;
  /** the children measure this much more than the meter (more than 5 % and above the absolute limit) */
  excess?: number;
}

export interface RoomNode {
  /** area_id from the config; stable across renames */
  id: string;
  name: string;
  icon?: string;
  color?: string;
  thresholds?: ThresholdConfig[];
  /** the own meter, or the sum of the consumers */
  watts: number;
  meter?: MeterInfo;
  consumers: ConsumerNode[];
}
export interface FloorNode {
  /** floor_id from the config; stable across renames */
  id: string;
  name: string;
  icon?: string;
  color?: string;
  thresholds?: ThresholdConfig[];
  /** the own meter, or the sum of the rooms */
  watts: number;
  meter?: MeterInfo;
  rooms: RoomNode[];
}
export interface SourceNode {
  entity: string;
  name: string;
  type: SourceType;
  icon?: string;
  color?: string;
  thresholds?: ThresholdConfig[];
  /** signed watts after `invert`; solar/generic are clipped at 0 (watt hours in the energy mode: what the source delivered) */
  watts: number;
  /** energy mode: watt hours of the other direction (grid feed-in, battery charged), when a return counter is set and readable */
  returned?: number;
  /** what the line shows: the power, or in the energy mode the balance of delivered minus returned */
  flow: number;
  /** energy mode: the source has a return counter, so it shows a line for the other direction */
  returnCounter?: boolean;
  valid: boolean;
  /** energy mode: the source has no energy sensor */
  noEnergy?: boolean;
  /** true while the source consumes power (battery charging, grid export); in the energy mode when the balance is negative */
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
  /** 0..1, null when home consumption is zero or the grid is not measured (no grid source, or unreadable) */
  autarky: number | null;
  /**
   * Share of the solar production used in the home, 0..1: (solar - feed-in) / solar. Null without a solar
   * source, without production, or when the feed-in is not known (power mode: grid unreadable; energy mode:
   * a grid source without a readable return counter).
   */
  selfConsumption: number | null;
  totalValid: boolean;
}

const DEFAULT_NAMES: Record<SourceType, string> = {
  solar: "PV",
  battery: "Batterie",
  grid: "Netz",
  generic: "Quelle",
};

const MISSING: Reading = { watts: 0, valid: false };

/** A meter warns when its children measure more than this share above it ... */
export const METER_EXCESS_SHARE = 0.05;
/** ... and at least this much: 10 W, or 50 Wh in the energy mode (watt hours there). */
export const METER_EXCESS_MIN_W = 10;
export const METER_EXCESS_MIN_WH = 50;

/**
 * Value of a room or a floor: its own meter for the shown mode when it has one and it can be read,
 * else the sum of its children.
 */
export function metered(
  meterId: string | undefined,
  children: number,
  read: Reader,
  energy: boolean,
): { watts: number; meter?: MeterInfo } {
  if (!meterId) return { watts: children };
  const r = read(meterId);
  if (!r.valid) return { watts: children, meter: { metered: false, invalid: true, unassigned: 0 } };
  const watts = Math.max(0, r.watts);
  const over = children - watts;
  const excess = over > watts * METER_EXCESS_SHARE && over >= (energy ? METER_EXCESS_MIN_WH : METER_EXCESS_MIN_W) ? over : undefined;
  return { watts, meter: { metered: true, unassigned: Math.max(0, -over), excess } };
}

function computeRoom(room: RoomConfig, read: Reader, energy: boolean): RoomNode {
  const consumers = (room.consumers ?? []).map((c): ConsumerNode => {
    const noEnergy = energy && !c.energy_entity;
    const noPower = !energy && !c.entity;
    const r = noEnergy || noPower ? MISSING : read(energy ? c.energy_entity! : c.entity!);
    // `entity` is the key of the consumer: its power sensor, else its energy counter
    return { entity: (c.entity ?? c.energy_entity)!, name: c.name, watts: r.valid ? Math.max(0, r.watts) : 0, valid: r.valid, noEnergy: noEnergy || undefined, noPower: noPower || undefined, thresholds: c.thresholds };
  });
  const sum = consumers.reduce((s, c) => s + c.watts, 0);
  const { watts, meter } = metered(energy ? room.energy_entity : room.entity, sum, read, energy);
  return {
    id: room.area_id,
    name: room.name ?? room.area_id,
    icon: room.icon,
    color: room.color,
    thresholds: room.thresholds,
    watts,
    meter,
    consumers,
  };
}

/**
 * `read` reads power sensors; `readSoc` reads state-of-charge sensors in percent
 * (defaults to `read`, which is enough for tests that use one lookup table).
 * With `energy` the model is built from the energy sensors instead (`read` then returns watt hours of
 * the period): elements without an energy sensor count 0 and are marked invalid.
 */
export function computeModel(
  cfg: EnergyCardConfig,
  read: Reader,
  readSoc: Reader = read,
  names: Record<SourceType, string> = DEFAULT_NAMES,
  energy = false,
): EnergyModel {
  const sources: SourceNode[] = (cfg.sources ?? []).map((s) => {
    const type = s.type ?? "generic";
    const noEnergy = energy && !s.energy_entity;
    const r = noEnergy ? MISSING : read(energy ? s.energy_entity! : s.entity);
    let watts = r.valid ? r.watts : 0;
    // an energy counter only counts what the source delivers
    if (s.invert && !energy) watts = -watts;
    if (type === "solar" || type === "generic") watts = Math.max(0, watts);
    const soc = s.soc_entity ? readSoc(s.soc_entity) : undefined;
    // the energy mode reads the other direction from its own counter; the line follows the balance
    const back = energy && s.energy_entity_return ? read(s.energy_entity_return) : undefined;
    const returned = back?.valid ? Math.max(0, back.watts) : undefined;
    const flow = returned !== undefined ? watts - returned : watts;
    return {
      entity: s.entity,
      name: s.name ?? names[type],
      type,
      icon: s.icon,
      color: s.color,
      thresholds: s.thresholds,
      watts,
      valid: r.valid,
      noEnergy: noEnergy || undefined,
      returned,
      flow,
      returnCounter: (energy && !!s.energy_entity_return) || undefined,
      reverse: flow < 0,
      share: 0,
      soc: soc?.valid ? soc.watts : undefined,
    };
  });

  const produced = sources.reduce((sum, s) => sum + Math.max(0, s.watts), 0);
  for (const s of sources) s.share = produced > 0 ? Math.max(0, s.watts) / produced : 0;

  const floors: FloorNode[] = (cfg.floors ?? []).map((f) => {
    const rooms = (f.rooms ?? []).map((r) => computeRoom(r, read, energy));
    const { watts, meter } = metered(energy ? f.energy_entity : f.entity, rooms.reduce((s, r) => s + r.watts, 0), read, energy);
    return { id: f.floor_id, name: f.name ?? f.floor_id, icon: f.icon, color: f.color, thresholds: f.thresholds, watts, meter, rooms };
  });
  const rooms = (cfg.rooms ?? []).map((r) => computeRoom(r, read, energy));

  const roomSum = floors.length
    ? floors.reduce((s, f) => s + f.watts, 0)
    : rooms.reduce((s, r) => s + r.watts, 0);

  const totalId = energy ? cfg.home?.total_energy_entity : cfg.home?.total_entity;
  const total = totalId ? read(totalId) : undefined;
  const totalValid = !!total?.valid;
  const homeWatts = totalValid ? Math.max(0, total!.watts) : roomSum;
  const unassigned = totalValid ? Math.max(0, homeWatts - roomSum) : 0;

  // Self-sufficiency is "the part of the consumption not drawn from the grid", so it is only
  // known when the grid is measured: without a grid source, or with a grid sensor that
  // cannot be read, there is nothing to subtract and the badge is left out (not shown as 100 %).
  const grids = sources.filter((s) => s.type === "grid");
  const gridKnown = grids.length > 0 && grids.every((s) => s.valid);
  const gridImport = grids.reduce((sum, s) => sum + Math.max(0, s.watts), 0);
  const autarky = gridKnown && homeWatts > 0 ? Math.min(1, Math.max(0, 1 - gridImport / homeWatts)) : null;

  // Self-consumption: the part of the solar production that was not fed into the grid.
  const solar = sources.filter((s) => s.type === "solar" && s.valid);
  const solarProduced = solar.reduce((sum, s) => sum + Math.max(0, s.watts), 0);
  const feedInKnown = grids.length > 0 && (energy ? grids.every((s) => s.returned !== undefined) : gridKnown);
  const feedIn = energy ? grids.reduce((sum, s) => sum + (s.returned ?? 0), 0) : grids.reduce((sum, s) => sum + Math.max(0, -s.watts), 0);
  const selfConsumption = solar.length && feedInKnown && solarProduced > 0 ? Math.min(1, Math.max(0, 1 - feedIn / solarProduced)) : null;

  return { sources, floors, rooms, homeWatts, unassigned, autarky, selfConsumption, totalValid };
}

/**
 * The "Unassigned" row of the consumer list, for what the list shows: one room (its meter minus its
 * consumers, only with a room meter), one floor with all its rooms (the floor minus all its consumers,
 * only when the floor or one of its rooms has a meter), or the whole home (the home minus all consumers).
 * `excess` instead: the children measure more than the meter of the room or floor.
 */
export interface Remainder {
  scope: "home" | "floor" | "room";
  name?: string;
  value: number;
  excess?: number;
}

const consumerSum = (rooms: RoomNode[]) => rooms.reduce((s, r) => s + r.consumers.reduce((t, c) => t + c.watts, 0), 0);

export function listRemainder(model: EnergyModel, floor?: FloorNode, room?: RoomNode): Remainder | undefined {
  if (room) {
    if (!room.meter?.metered) return undefined;
    return { scope: "room", name: room.name, value: room.meter.unassigned, excess: room.meter.excess };
  }
  if (floor) {
    if (!floor.meter?.metered && !floor.rooms.some((r) => r.meter?.metered)) return undefined;
    return { scope: "floor", name: floor.name, value: Math.max(0, floor.watts - consumerSum(floor.rooms)), excess: floor.meter?.excess };
  }
  const rooms = model.floors.length ? model.floors.flatMap((f) => f.rooms) : model.rooms;
  return { scope: "home", value: Math.max(0, model.homeWatts - consumerSum(rooms)) };
}

/** Key of a node for its second value: the home, a source or a consumer by entity, a floor or a room by id. */
export const nodeKey = {
  home: "home",
  source: (entity: string) => `s:${entity}`,
  floor: (id: string) => `f:${id}`,
  room: (id: string) => `r:${id}`,
  consumer: (entity: string) => `c:${entity}`,
};

/**
 * Values of the nodes that have one, for the second line (`options.secondary_value`). A node without a
 * readable sensor is left out, and so is a room or a floor without a meter and without any child that has
 * a value, so that no "0 kWh" appears where nothing is measured. In the energy mode the values are watt hours.
 */
export function nodeValues(model: EnergyModel): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of model.sources) if (s.valid && !s.noEnergy) out.set(nodeKey.source(s.entity), s.watts);
  const room = (r: RoomNode): boolean => {
    let has = !!r.meter?.metered;
    for (const c of r.consumers) {
      if (!c.valid || c.noEnergy || c.noPower) continue;
      out.set(nodeKey.consumer(c.entity), c.watts);
      has = true;
    }
    if (has) out.set(nodeKey.room(r.id), r.watts);
    return has;
  };
  let any = false;
  for (const f of model.floors) {
    const rooms = f.rooms.map(room).some(Boolean);
    if (rooms || f.meter?.metered) {
      out.set(nodeKey.floor(f.id), f.watts);
      any = true;
    }
  }
  if (model.rooms.map(room).some(Boolean)) any = true;
  if (any || model.totalValid) out.set(nodeKey.home, model.homeWatts);
  return out;
}
