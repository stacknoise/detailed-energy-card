import type { ConsumerConfig, EnergyCardConfig, FloorConfig, RoomConfig, SourceConfig } from "../../model/config";
import { validateConfig } from "../../model/config";
import type { Proposal, ProposedConsumer, ProposedRoom, ProposedSource } from "./propose";

export type ApplyMode = "replace" | "merge";

/** The sections of a card configuration the wizard writes. */
export interface Sections {
  sources: SourceConfig[];
  floors?: FloorConfig[];
  rooms?: RoomConfig[];
  /** rooms that cannot be shown because their area is on no floor while floors are used */
  unplaced: string[];
}

const sourceOf = (s: ProposedSource): SourceConfig | undefined => {
  const entity = s.power ?? s.chosenPower;
  if (!entity) return undefined;
  const out: SourceConfig = { entity, type: s.type };
  if (s.name) out.name = s.name;
  if (s.energy) out.energy_entity = s.energy;
  // solar has one direction only
  if (s.energyReturn && s.type !== "solar") out.energy_entity_return = s.energyReturn;
  if (s.soc && s.type === "battery") out.soc_entity = s.soc;
  return out;
};

/** A sensor may be assigned once: later uses of the same sensor are dropped. */
function uniqueSensors() {
  const used = new Set<string>();
  return (id: string | undefined): string | undefined => {
    if (!id || used.has(id)) return undefined;
    used.add(id);
    return id;
  };
}

/**
 * The sources, floors and rooms of the selected part of a proposal. Rooms go under their floors; when no selected room
 * has a floor, the card is built from rooms alone. Rooms without a floor are left out while floors are used, as the card
 * shows rooms on floors only (they are returned in `unplaced`).
 */
export function buildSections(p: Proposal): Sections {
  const claim = uniqueSensors();
  const sources: SourceConfig[] = [];
  for (const s of p.sources.filter((x) => x.selected)) {
    const c = sourceOf(s);
    if (!c) continue;
    const power = claim(c.entity);
    if (!power) continue;
    claim(c.energy_entity);
    claim(c.energy_entity_return);
    sources.push(c);
  }

  const consumer = (c: ProposedConsumer): ConsumerConfig | undefined => {
    const energy = claim(c.stat);
    if (!energy) return undefined;
    const out: ConsumerConfig = { energy_entity: energy };
    const power = claim(c.power);
    if (power) out.entity = power;
    if (c.rename) out.name = c.rename;
    return out;
  };
  const room = (r: ProposedRoom): RoomConfig | undefined => {
    const out: RoomConfig = { area_id: r.areaId };
    if (r.meter?.selected) {
      const energy = claim(r.meter.stat);
      if (energy) out.energy_entity = energy;
      const power = claim(r.meter.power);
      if (power) out.entity = power;
    }
    const consumers = r.consumers.filter((c) => c.selected).flatMap((c) => consumer(c) ?? []);
    if (consumers.length) out.consumers = consumers;
    return consumers.length || out.energy_entity ? out : undefined;
  };

  const floors: FloorConfig[] = [];
  for (const f of p.floors) {
    const rooms = f.rooms.flatMap((r) => room(r) ?? []);
    if (rooms.length) floors.push({ floor_id: f.floorId, rooms });
  }
  const loose = p.looseRooms.flatMap((r) => room(r) ?? []);
  if (floors.length) return { sources, floors, unplaced: loose.map((r) => r.area_id) };
  return { sources, rooms: loose, unplaced: [] };
}

const sensorsOf = (o: { entity?: string; energy_entity?: string; energy_entity_return?: string }): string[] =>
  [o.entity, o.energy_entity, o.energy_entity_return].filter((e): e is string => !!e);

/** Every sensor already assigned somewhere in a configuration. */
function usedSensors(cfg: EnergyCardConfig): Set<string> {
  const used = new Set<string>();
  const add = (o: { entity?: string; energy_entity?: string; energy_entity_return?: string }) => sensorsOf(o).forEach((e) => used.add(e));
  (cfg.sources ?? []).forEach(add);
  const rooms = [...(cfg.rooms ?? []), ...(cfg.floors ?? []).flatMap((f) => f.rooms ?? [])];
  (cfg.floors ?? []).forEach(add);
  for (const r of rooms) {
    add(r);
    (r.consumers ?? []).forEach(add);
  }
  return used;
}

/**
 * An entry the card has by its power sensor but without an energy counter gets the counter the dashboard knows for
 * that power sensor (sources also the counter of the other direction and the charge sensor), when the counter is free.
 * Nothing else of an existing entry changes.
 */
function enrich(cfg: EnergyCardConfig, s: Sections, used: Set<string>): void {
  const free = (id: string | undefined): id is string => !!id && !used.has(id);
  const mine = (cfg.sources ?? []).filter((x) => x.entity);
  for (const incoming of s.sources) {
    const target = mine.find((x) => x.entity === incoming.entity);
    if (!target) continue;
    if (!target.energy_entity && free(incoming.energy_entity)) {
      target.energy_entity = incoming.energy_entity;
      used.add(incoming.energy_entity);
    }
    if (!target.energy_entity_return && target.type !== "solar" && free(incoming.energy_entity_return)) {
      target.energy_entity_return = incoming.energy_entity_return;
      used.add(incoming.energy_entity_return);
    }
    if (!target.soc_entity && free(incoming.soc_entity)) target.soc_entity = incoming.soc_entity;
  }
  const consumers = [...(cfg.rooms ?? []), ...(cfg.floors ?? []).flatMap((f) => f.rooms ?? [])].flatMap((r) => r.consumers ?? []);
  const incomingConsumers = [...(s.rooms ?? []), ...(s.floors ?? []).flatMap((f) => f.rooms ?? [])].flatMap((r) => r.consumers ?? []);
  for (const incoming of incomingConsumers) {
    if (!incoming.entity) continue;
    const target = consumers.find((c) => c.entity === incoming.entity);
    if (target && !target.energy_entity && free(incoming.energy_entity)) {
      target.energy_entity = incoming.energy_entity;
      used.add(incoming.energy_entity);
    }
  }
}

/** Drops from a room what is already assigned (or taken in this run); returns undefined when nothing is left of it. */
function freshRoom(r: RoomConfig, used: Set<string>): RoomConfig | undefined {
  const out: RoomConfig = { ...r };
  for (const key of ["entity", "energy_entity"] as const) {
    const id = out[key];
    if (id && used.has(id)) delete out[key];
  }
  const consumers = (r.consumers ?? []).filter((c) => !sensorsOf(c).some((e) => used.has(e)));
  if (consumers.length) out.consumers = consumers;
  else delete out.consumers;
  const kept = !!out.entity || !!out.energy_entity || !!out.consumers;
  if (kept) {
    sensorsOf(out).forEach((e) => used.add(e));
    consumers.forEach((c) => sensorsOf(c).forEach((e) => used.add(e)));
  }
  return kept ? out : undefined;
}

/**
 * Applies the sections to a configuration. `replace` writes the new sources, floors and rooms and keeps everything else
 * (title, colors, options, thresholds of the card as a whole). `merge` only adds what the card lacks: sources, floors, rooms
 * and devices that are not there yet; what exists, with its names, colors, thresholds and options, stays.
 */
export function applySections(existing: EnergyCardConfig | undefined, s: Sections, mode: ApplyMode): EnergyCardConfig {
  const base: EnergyCardConfig = { type: "custom:detailed-energy-card", ...(existing ?? {}) };
  if (mode === "replace" || !existing) {
    const out: EnergyCardConfig = { ...base, sources: s.sources };
    delete out.floors;
    delete out.rooms;
    if (s.floors) out.floors = s.floors;
    else if (s.rooms?.length) out.rooms = s.rooms;
    if (!out.sources?.length) delete out.sources;
    return out;
  }

  const used = usedSensors(base);
  // what is changed below is copied first: the configuration the card has now stays as it is
  const out: EnergyCardConfig = {
    ...base,
    sources: base.sources?.map((x) => ({ ...x })),
    floors: base.floors?.map((f) => ({ ...f, rooms: (f.rooms ?? []).map((r) => ({ ...r, consumers: r.consumers?.map((c) => ({ ...c })) })) })),
    rooms: base.rooms?.map((r) => ({ ...r, consumers: r.consumers?.map((c) => ({ ...c })) })),
  };
  for (const key of ["sources", "floors", "rooms"] as const) if (!out[key]) delete out[key];
  enrich(out, s, used);
  const newSources = s.sources.filter((src) => !sensorsOf(src).some((e) => used.has(e)));
  newSources.forEach((src) => sensorsOf(src).forEach((e) => used.add(e)));
  if (newSources.length) out.sources = [...(out.sources ?? []), ...newSources];

  if (out.floors?.length) {
    // into the floors that exist, new floors at the end; rooms without a floor cannot be placed
    const floors = out.floors.map((f) => ({ ...f, rooms: [...(f.rooms ?? [])] }));
    for (const nf of s.floors ?? []) {
      let target = floors.find((f) => f.floor_id === nf.floor_id);
      if (!target) {
        target = { ...nf, rooms: [] };
        floors.push(target);
      }
      for (const nr of nf.rooms ?? []) {
        const same = target.rooms!.find((r) => r.area_id === nr.area_id);
        if (same) {
          const add = (nr.consumers ?? []).filter((c) => !sensorsOf(c).some((e) => used.has(e)));
          add.forEach((c) => sensorsOf(c).forEach((e) => used.add(e)));
          if (add.length) same.consumers = [...(same.consumers ?? []), ...add];
        } else {
          const fresh = freshRoom(nr, used);
          if (fresh) target.rooms!.push(fresh);
        }
      }
    }
    out.floors = floors.filter((f) => f.rooms?.length);
  } else {
    // the card has rooms (or nothing yet): the rooms of the proposal, floors dissolved, rooms of the same area merged
    const rooms = (out.rooms ?? []).map((r) => ({ ...r }));
    const incoming = [...(s.rooms ?? []), ...(s.floors ?? []).flatMap((f) => f.rooms ?? [])];
    for (const nr of incoming) {
      const same = rooms.find((r) => r.area_id === nr.area_id);
      if (same) {
        const add = (nr.consumers ?? []).filter((c) => !sensorsOf(c).some((e) => used.has(e)));
        add.forEach((c) => sensorsOf(c).forEach((e) => used.add(e)));
        if (add.length) same.consumers = [...(same.consumers ?? []), ...add];
      } else {
        const fresh = freshRoom(nr, used);
        if (fresh) rooms.push(fresh);
      }
    }
    if (rooms.length) out.rooms = rooms;
  }
  return out;
}

/** The result of applying the wizard: the configuration, or why the card would refuse it. */
export function checkedConfig(cfg: EnergyCardConfig): { config: EnergyCardConfig; error?: string } {
  try {
    validateConfig(cfg);
    return { config: cfg };
  } catch (e) {
    return { config: cfg, error: (e as Error).message };
  }
}
