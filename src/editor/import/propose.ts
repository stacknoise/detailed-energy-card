import type { Collected, CollectedDevice, CollectedSource, ImportHass } from "./collect";

export interface ProposedSource extends CollectedSource {
  id: string;
  selected: boolean;
  /** the power sensor the user chose when the dashboard gave none */
  chosenPower?: string;
}

export interface ProposedConsumer extends CollectedDevice {
  selected: boolean;
  /** the name the user typed, else the card shows the name of the entity */
  rename?: string;
  /** `included_in_stat` of a device that is shown under its parent */
  parent?: string;
  /** the parent was not made the meter of the room: this device is left out by default to avoid counting it twice */
  coveredByParent?: boolean;
}

export interface ProposedRoom {
  areaId: string;
  name: string;
  selected: boolean;
  /** the parent device that measures the whole room (becomes `energy_entity` / `entity` of the room) */
  meter?: ProposedConsumer;
  consumers: ProposedConsumer[];
}

export interface ProposedFloor {
  floorId: string;
  name: string;
  selected: boolean;
  rooms: ProposedRoom[];
}

export interface Proposal {
  sources: ProposedSource[];
  floors: ProposedFloor[];
  /** areas that are on no floor */
  looseRooms: ProposedRoom[];
  /** devices without an area, not taken over by default */
  noRoom: ProposedConsumer[];
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/**
 * The structure the card would show for what the Energy dashboard knows: sources, then floors, rooms and devices by
 * the areas Home Assistant assigns them to. A device that is part of another one (`included_in_stat`) sits under its
 * parent: the parent becomes the meter of the room when the whole family is in one room, otherwise the parent counts
 * as a device and the parts are left out by default, so nothing is counted twice. Devices that are no entity of this
 * installation (external statistics) are shown, but cannot be taken over.
 */
export function propose(collected: Collected, hass: ImportHass): Proposal {
  const sources: ProposedSource[] = collected.sources.map((s, i) => ({
    ...s,
    id: `${s.type}:${i}`,
    // the card needs a power sensor for a source: without one it waits for the user's choice
    selected: s.usable && !!s.power,
  }));

  const byStat = new Map(collected.devices.map((d) => [d.stat, d]));
  const children = new Map<string, CollectedDevice[]>();
  for (const d of collected.devices) {
    if (d.includedIn && byStat.has(d.includedIn)) children.set(d.includedIn, [...(children.get(d.includedIn) ?? []), d]);
  }

  const asMeter = new Set<string>();
  for (const [parent, kids] of children) {
    const p = byStat.get(parent)!;
    // one room for the whole family: a part without an area belongs to the room of its parent
    if (p.usable && p.areaId && kids.every((k) => !k.areaId || k.areaId === p.areaId)) asMeter.add(parent);
  }

  const rooms = new Map<string, ProposedRoom>();
  const noRoom: ProposedConsumer[] = [];
  const consumer = (d: CollectedDevice): ProposedConsumer => {
    const parent = d.includedIn && byStat.has(d.includedIn) ? d.includedIn : undefined;
    const covered = !!parent && !asMeter.has(parent);
    return { ...d, parent, coveredByParent: covered || undefined, selected: d.usable && !covered };
  };
  const roomOf = (areaId: string): ProposedRoom => {
    let r = rooms.get(areaId);
    if (!r) {
      r = { areaId, name: hass.areas?.[areaId]?.name ?? areaId, selected: true, consumers: [] };
      rooms.set(areaId, r);
    }
    return r;
  };
  for (const d of collected.devices) {
    const parentDevice = d.includedIn ? byStat.get(d.includedIn) : undefined;
    const area = d.areaId ?? (asMeter.has(d.includedIn ?? "") ? parentDevice?.areaId : undefined);
    if (asMeter.has(d.stat)) {
      roomOf(d.areaId!).meter = { ...consumer(d), selected: d.usable };
      continue;
    }
    if (!area) {
      noRoom.push({ ...consumer(d), selected: false });
      continue;
    }
    roomOf(area).consumers.push(consumer(d));
  }
  // parents first inside a room, their parts right after them
  for (const r of rooms.values()) {
    r.consumers.sort((a, b) => (a.parent ?? a.stat).localeCompare(b.parent ?? b.stat) || (a.parent ? 1 : 0) - (b.parent ? 1 : 0) || byName(a, b));
    r.selected = r.consumers.some((c) => c.selected) || !!r.meter;
  }

  const floors = new Map<string, ProposedFloor>();
  const looseRooms: ProposedRoom[] = [];
  for (const r of [...rooms.values()].sort(byName)) {
    const fid = hass.areas?.[r.areaId]?.floor_id;
    if (!fid) {
      looseRooms.push(r);
      continue;
    }
    let f = floors.get(fid);
    if (!f) {
      f = { floorId: fid, name: hass.floors?.[fid]?.name ?? fid, selected: true, rooms: [] };
      floors.set(fid, f);
    }
    f.rooms.push(r);
  }
  const level = (f: ProposedFloor) => hass.floors?.[f.floorId]?.level ?? 0;
  const sortedFloors = [...floors.values()].sort((a, b) => level(a) - level(b) || byName(a, b));
  for (const f of sortedFloors) f.selected = f.rooms.some((r) => r.selected);
  return { sources, floors: sortedFloors, looseRooms, noRoom };
}

const allRooms = (p: Proposal): ProposedRoom[] => [...p.floors.flatMap((f) => f.rooms), ...p.looseRooms];

/** Switches a floor on or off together with everything under it (devices that cannot be taken over stay off). */
export function setFloor(p: Proposal, floorId: string, on: boolean): void {
  const f = p.floors.find((x) => x.floorId === floorId);
  if (!f) return;
  f.selected = on;
  for (const r of f.rooms) setRoom(p, r.areaId, on);
}

/** Switches a room on or off together with its devices; the family of a meter follows the meter. */
export function setRoom(p: Proposal, areaId: string, on: boolean): void {
  const r = allRooms(p).find((x) => x.areaId === areaId);
  if (!r) return;
  r.selected = on;
  if (r.meter) r.meter.selected = on && r.meter.usable;
  for (const c of r.consumers) c.selected = on && c.usable && !(on && c.coveredByParent);
  const f = p.floors.find((x) => x.rooms.includes(r));
  if (f) f.selected = f.rooms.some((x) => x.selected);
}

/** Switches one device on or off; switching a device on brings its room and floor along. */
export function setConsumer(p: Proposal, stat: string, on: boolean): void {
  for (const r of allRooms(p)) {
    const c = r.consumers.find((x) => x.stat === stat) ?? (r.meter?.stat === stat ? r.meter : undefined);
    if (!c) continue;
    c.selected = on && c.usable;
    if (on && c.usable) {
      r.selected = true;
      const f = p.floors.find((x) => x.rooms.includes(r));
      if (f) f.selected = true;
    }
    return;
  }
  const loose = p.noRoom.find((x) => x.stat === stat);
  if (loose) loose.selected = on && loose.usable;
}

/**
 * Puts a device into another room (or back to "no room"), for devices Home Assistant has not assigned or assigned
 * wrongly. A room that does not exist yet is created on its floor.
 */
export function moveConsumer(p: Proposal, hass: ImportHass, stat: string, areaId: string | undefined): void {
  let moved: ProposedConsumer | undefined;
  for (const r of allRooms(p)) {
    const i = r.consumers.findIndex((x) => x.stat === stat);
    if (i >= 0) [moved] = r.consumers.splice(i, 1);
  }
  const j = p.noRoom.findIndex((x) => x.stat === stat);
  if (j >= 0) [moved] = p.noRoom.splice(j, 1);
  if (!moved) return;
  moved.areaId = areaId;
  if (!areaId) {
    moved.selected = false;
    p.noRoom.push(moved);
    return;
  }
  let room = allRooms(p).find((x) => x.areaId === areaId);
  if (!room) {
    room = { areaId, name: hass.areas?.[areaId]?.name ?? areaId, selected: true, consumers: [] };
    const fid = hass.areas?.[areaId]?.floor_id;
    if (fid) {
      let f = p.floors.find((x) => x.floorId === fid);
      if (!f) {
        f = { floorId: fid, name: hass.floors?.[fid]?.name ?? fid, selected: true, rooms: [] };
        p.floors.push(f);
      }
      f.rooms.push(room);
    } else p.looseRooms.push(room);
  }
  room.consumers.push(moved);
  setConsumer(p, stat, moved.usable);
}

/** What the wizard says about the proposal: "3 sources, 2 floors, 7 rooms, 18 consumers, 4 left out". */
export function summarize(p: Proposal): { sources: number; floors: number; rooms: number; consumers: number; skipped: number } {
  const rooms = allRooms(p).filter((r) => r.consumers.some((c) => c.selected) || r.meter?.selected);
  const placed = rooms.flatMap((r) => r.consumers);
  const everyone = [...allRooms(p).flatMap((r) => [...r.consumers, ...(r.meter ? [r.meter] : [])]), ...p.noRoom];
  const taken = everyone.filter((c) => c.selected).length;
  return {
    sources: p.sources.filter((s) => s.selected).length,
    floors: p.floors.filter((f) => f.rooms.some((r) => rooms.includes(r))).length,
    rooms: rooms.length,
    consumers: placed.filter((c) => c.selected).length,
    skipped: everyone.length - taken,
  };
}
