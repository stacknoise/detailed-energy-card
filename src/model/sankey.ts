import type { ConsumerNode, EnergyModel, FloorNode, RoomNode, SourceNode } from "./compute";
import type { SankeyLinkIn, SankeyNodeIn } from "../view/sankey-layout";

/** What a node stands for, so that the card knows what a click on it does. */
export type SankeyRef =
  | { kind: "source"; entity: string }
  | { kind: "floor"; id: string }
  | { kind: "room"; id: string; floor?: string }
  | { kind: "consumer"; entity: string }
  | { kind: "unassigned" }
  | { kind: "feedin" }
  | { kind: "charge" };

export interface SankeyGraphNode extends SankeyNodeIn {
  name: string;
  color?: string;
  ref: SankeyRef;
  /** the node takes its energy in proportion from the sources (floors, unassigned): the tooltip says so */
  split?: boolean;
}

export interface SankeyGraph {
  nodes: SankeyGraphNode[];
  links: SankeyLinkIn[];
}

export interface SankeyText {
  unassigned: string;
  unassignedIn: (name: string) => string;
  feedIn: string;
  charge: string;
  consumer: (c: ConsumerNode) => string;
}

export interface SankeyInput {
  model: EnergyModel;
  /** the selected floor: only its rooms are shown; undefined shows the rooms of all floors */
  floorId?: string;
  /** the selected room: its consumers form the last column */
  roomId?: string;
  showUnassigned: boolean;
  /** the energy mode: sources have a "returned" direction in watt hours; otherwise a negative power is the return */
  energy: boolean;
  text: SankeyText;
}

const EPS = 1e-9;

interface Supply {
  source: SourceNode;
  deliver: number;
  left: number;
}

/**
 * The graph of the Sankey diagram from the model and the selection: sources, then floors (rooms of the
 * home without floors), their rooms, and the consumers of the selected room. Below sit the nodes for the
 * energy that left the home again (grid feed-in, battery charging).
 *
 * The model does not know which source supplied which floor, so every source supplies every node of the first
 * column in the same share as it supplies the home; returned energy comes from the producing sources first
 * (PV, generic), then from the others, never from its own kind (the grid does not feed itself in).
 */
export function buildSankey(i: SankeyInput): SankeyGraph {
  const { model, text } = i;
  const nodes: SankeyGraphNode[] = [];
  const links: SankeyLinkIn[] = [];
  const link = (from: string, to: string, value: number) => {
    if (value > EPS) links.push({ id: `${from}>${to}`, from, to, value });
  };

  // ---- sources and what flows back out of the home
  const supply: Supply[] = model.sources
    .filter((s) => s.valid && !s.noEnergy)
    .map((s) => ({ source: s, deliver: Math.max(0, s.watts), left: Math.max(0, s.watts) }));
  const back = (s: SourceNode): number => (i.energy ? (s.returned ?? 0) : s.type === "solar" || s.type === "generic" ? 0 : Math.max(0, -s.watts));
  const sourceId = (s: SourceNode) => `s:${s.entity}`;
  const returns: Array<{ id: string; type: "grid" | "battery"; name: string; kind: "feedin" | "charge"; amount: number }> = [];
  for (const s of model.sources) {
    const amount = back(s);
    if (!s.valid || amount <= EPS || (s.type !== "grid" && s.type !== "battery")) continue;
    const kind = s.type === "grid" ? "feedin" : "charge";
    const found = returns.find((r) => r.kind === kind);
    if (found) found.amount += amount;
    else returns.push({ id: `r:${kind}`, type: s.type, name: kind === "feedin" ? text.feedIn : text.charge, kind, amount });
  }
  for (const r of returns) {
    let need = r.amount;
    const producers = supply.filter((s) => s.source.type === "solar" || s.source.type === "generic");
    const others = supply.filter((s) => !producers.includes(s) && s.source.type !== r.type);
    for (const tier of [producers, others]) {
      const sum = tier.reduce((t, s) => t + s.left, 0);
      const take = Math.min(need, sum);
      if (take <= EPS) continue;
      for (const s of tier) {
        const amt = (take * s.left) / sum;
        link(sourceId(s.source), r.id, amt);
        s.left -= amt;
      }
      need -= take;
    }
  }

  const inflow = supply.reduce((t, s) => t + s.left, 0);
  for (const s of supply) {
    if (s.deliver > EPS) nodes.push({ id: sourceId(s.source), col: 0, value: s.deliver, name: s.source.name, color: s.source.color, ref: { kind: "source", entity: s.source.entity } });
  }

  // ---- the first column: floors (or rooms) and what nobody measures
  const floors = model.floors;
  const showFloorRooms = (f: FloorNode) => i.floorId === undefined || i.floorId === f.id;
  const roomsOf = (f: FloorNode): RoomNode[] => (showFloorRooms(f) ? f.rooms : []);
  const sumRooms = (rooms: RoomNode[]) => rooms.reduce((t, r) => t + r.watts, 0);
  const first: SankeyGraphNode[] = [];
  if (floors.length) {
    for (const f of floors) {
      const kids = roomsOf(f);
      const value = Math.max(f.watts, sumRooms(kids));
      if (value > EPS) first.push({ id: `f:${f.id}`, col: 1, value, name: f.name, color: f.color, ref: { kind: "floor", id: f.id }, split: true });
    }
  } else {
    for (const r of model.rooms) {
      if (r.watts > EPS) first.push({ id: `r:${r.id}`, col: 1, value: r.watts, name: r.name, color: r.color, ref: { kind: "room", id: r.id }, split: true });
    }
  }
  if (i.showUnassigned && model.unassigned > EPS) {
    first.push({ id: "u:home", col: 1, value: model.unassigned, name: text.unassigned, ref: { kind: "unassigned" }, split: true });
  }
  // every source supplies each node of the first column in the share it supplies the home
  if (inflow > EPS) {
    for (const n of first) for (const s of supply) link(sourceId(s.source), n.id, (n.value * s.left) / inflow);
  }
  nodes.push(...first);

  // ---- rooms of the visible floors, their remainders, and the consumers of the selected room
  const roomNodes = (rooms: RoomNode[], parent: string, col: number, floor?: string) => {
    for (const r of rooms) {
      if (r.watts <= EPS) continue;
      const id = `r:${r.id}`;
      nodes.push({ id, col, value: r.watts, name: r.name, color: r.color, ref: { kind: "room", id: r.id, floor } });
      link(parent, id, r.watts);
    }
  };
  let roomCol = 1;
  let rooms: RoomNode[] = model.rooms;
  if (floors.length) {
    roomCol = 2;
    rooms = [];
    for (const f of floors) {
      const kids = roomsOf(f);
      if (!kids.length) continue;
      roomNodes(kids, `f:${f.id}`, 2, f.id);
      rooms.push(...kids);
      // a floor with a meter that measures more than its rooms: the rest is not recorded
      const rest = f.meter?.metered ? f.watts - sumRooms(kids) : 0;
      if (i.showUnassigned && rest > EPS) {
        const id = `u:f:${f.id}`;
        nodes.push({ id, col: 2, value: rest, name: text.unassignedIn(f.name), ref: { kind: "unassigned" } });
        link(`f:${f.id}`, id, rest);
      }
    }
  }
  const room = rooms.find((r) => r.id === i.roomId);
  if (room && room.watts > EPS) {
    const col = roomCol + 1;
    for (const c of room.consumers) {
      if (!c.valid || c.noEnergy || c.watts <= EPS) continue;
      const id = `c:${c.entity}`;
      nodes.push({ id, col, value: c.watts, name: text.consumer(c), ref: { kind: "consumer", entity: c.entity } });
      link(`r:${room.id}`, id, c.watts);
    }
    const rest = room.meter?.metered ? room.meter.unassigned : 0;
    if (i.showUnassigned && rest > EPS) {
      const id = `u:r:${room.id}`;
      nodes.push({ id, col, value: rest, name: text.unassignedIn(room.name), ref: { kind: "unassigned" } });
      link(`r:${room.id}`, id, rest);
    }
  }

  // ---- feed-in and charging: below everything else, in the first column of the home
  for (const r of returns) {
    const value = links.filter((l) => l.to === r.id).reduce((t, l) => t + l.value, 0);
    if (value <= EPS) continue;
    nodes.push({ id: r.id, col: 1, value, name: r.name, ref: { kind: r.kind }, tail: true });
  }

  // within a column the nodes keep the order of the configuration; the tail goes last
  const order = (n: SankeyGraphNode) => (n.tail ? 1 : 0);
  nodes.sort((a, b) => a.col - b.col || order(a) - order(b));
  return { nodes, links };
}
