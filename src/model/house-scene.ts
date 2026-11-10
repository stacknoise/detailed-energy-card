import type { EnergyModel, FloorNode, RoomNode, SourceNode } from "./compute";
import {
  BRANCH_LIFT,
  CELL,
  GROUND,
  MAST,
  PITCH,
  RISER_OFFSET,
  ROOF_H,
  ROOM_H,
  ROOM_INSET,
  SLAB,
  SOLAR,
  SOLAR_COLS,
  SOLAR_ROWS,
  drawOrder,
  gridOf,
  layoutFloor,
  type BoxKind,
  type BoxTone,
  type HouseConfig,
  type HouseScene,
  type HouseSelection,
  type RoomLayout,
  type SceneBox,
  type SceneFlow,
  type SceneLabel,
  type Vec3,
} from "./house";
import { localize } from "../localize";
import { SOURCE_COLORS, dominantSource, sourceMix } from "./mix";
import { elementThresholds, isIdle, resolveThresholds, thresholdColor, thresholdLevel, thresholdWidth, type ThresholdConfig } from "./thresholds";

/** Input of the scene builder: the computed model of the energy card, the config with its layouts, the selection and the value format. */
export interface HouseSceneInput {
  model: EnergyModel;
  config: HouseConfig;
  selection: HouseSelection;
  /** formats watts as the card shows them (`formatPower` with the card's unit and decimals) */
  format: (watts: number) => string;
  /** language for names and the aria texts */
  lang?: string;
}

/*
 * Measures of the flow lines that the mock fixes but AP0 did not name. They belong to the scene builder; the
 * mock (docs/mockups/3d/house-view-mock.html, variant A) has them as literals.
 */
/** Stroke width of a flow line without a threshold width (the dashed line of the mock). */
const FLOW_W = 2;
/** A threshold range adds this much width per reached range, at most `MAX_LEVEL` ranges (as the tree view does). */
const LEVEL_STEP = 0.75;
const MAX_LEVEL = 3;
/** Where the branch of the lowest floor ends, as a share of the depth (50 of 75 in the mock); the battery lane ends at the middle of its room (19). */
const LANE_SOLAR = 2 / 3;
/** Distance between two lanes when a lane is taken more than once. */
const LANE_STEP = 8;
/** The grid line ends this far from the front edge of the slab (62 of 75 in the mock). */
const GRID_ENTRY = 13;
/** The grid pole stands this far left of the right edge of the house and this far in front of it (98 and 54 in the mock). */
const MAST_FROM_RIGHT = 52;
const MAST_FRONT = 54;
/** A room label needs a room at least this wide (scene units); smaller rooms keep their value in the aria text and the list. */
const ROOM_LABEL_MIN_W = 24;
/** Inset of the line ends from the side of the house and the roof (150 - 142 in the mock). */
const END_INSET = 8;
/** A battery without a room: a pink block next to the riser, 20 x 20 x 18 as in variant B of the mock. */
const BATTERY_BOX = { size: 20, h: 18, gap: 16 } as const;

/** Floor as the scene needs it: model node plus the layout rooms of the config. */
interface SceneFloor {
  node: FloorNode;
  /** false for the rooms of a home without floors: one anonymous floor */
  real: boolean;
  rooms: Array<{ node: RoomNode; layout: RoomLayout }>;
}

const kinds = (s: SourceNode[], type: SourceNode["type"]): SourceNode[] => s.filter((x) => x.type === type);

/** Floors from the bottom to the top (the order of the config), each with the layout of its rooms. */
function sceneFloors(model: EnergyModel, config: HouseConfig, cols: number, rows: number): SceneFloor[] {
  const withLayouts = (rooms: RoomNode[], cfgRooms: Array<{ area_id: string; layout?: RoomLayout }> | undefined): SceneFloor["rooms"] => {
    // own layouts stay, the others are placed by the geometry package; a room that finds no place is not drawn
    const own = rooms.map((node) => cfgRooms?.find((r) => r.area_id === node.id) ?? { layout: undefined });
    const placed = layoutFloor(own, cols, rows);
    return rooms.flatMap((node, i) => (placed[i] ? [{ node, layout: placed[i]! }] : []));
  };
  if (model.floors.length) {
    return model.floors.map((node, i) => ({ node, real: true, rooms: withLayouts(node.rooms, config.floors?.[i]?.rooms) }));
  }
  if (!model.rooms.length) return [];
  const watts = model.rooms.reduce((s, r) => s + r.watts, 0);
  const node: FloorNode = { id: "", name: "", watts, rooms: model.rooms };
  return [{ node, real: false, rooms: withLayouts(model.rooms, config.rooms) }];
}

/**
 * AP2: builds the scene from the model, the layout and the selection. Pure: no DOM, no clock.
 *
 * Floors stack from the bottom in the order of the config; every room is a block on its floor at its `layout`
 * (rooms without one are placed by `layoutFloor`). The solar modules sit on the roof, the grid pole stands in front,
 * a battery is a block of its own, or the room that holds its sensor as a consumer. A riser to the right of the
 * house distributes the power to the floors. The model does not know which source supplies which floor: every branch
 * carries the power of its floor and takes the color of the leading source, as the Sankey diagram shares it out.
 *
 * Selection: a selected floor or room is marked `selected`; the other floors, their rooms and branches (and, with
 * a selected room, the other rooms of its floor) are `dimmed`, and so are the roof, the sources and their lines. The ground stays as it is.
 */
export function buildHouseScene(input: HouseSceneInput): HouseScene {
  const { model, config, selection, format, lang } = input;
  const { cols, rows } = gridOf(config);
  const width = cols * CELL;
  const depth = rows * CELL;
  const floors = sceneFloors(model, config, cols, rows);
  const th = resolveThresholds(config.colors?.thresholds, config.colors?.level_thresholds);
  const bySource = !!config.options?.lines_by_source;

  const boxes: SceneBox[] = [];
  const labels: SceneLabel[] = [];
  const flows: SceneFlow[] = [];

  // ---- selection: a room selects its floor, too
  const selArea = selection.area_id;
  const selFloor = selection.floor_id ?? (selArea !== undefined ? floors.find((f) => f.rooms.some((r) => r.node.id === selArea))?.node.id : undefined);
  const anySel = selFloor !== undefined || selArea !== undefined;
  const floorDim = (id: string): boolean => anySel && id !== selFloor;
  /** roof, solar, battery block, pole and their labels and lines fade out with any selection, like the floors */
  const selSource = selection.source;
  /** a source part fades out when a floor or room is selected, or another source is */
  const srcDimFor = (entities: string[]): boolean => anySel || (selSource !== undefined && !entities.includes(selSource));
  const roomDim = (floorId: string, areaId: string): boolean => floorDim(floorId) || (selArea !== undefined && areaId !== selArea);

  // ---- sources
  const solars = kinds(model.sources, "solar");
  const grids = kinds(model.sources, "grid");
  const batteries = kinds(model.sources, "battery");
  const generics = kinds(model.sources, "generic");
  const sourceColor = (s: SourceNode): string => s.color ?? SOURCE_COLORS[s.type];
  const batteryRoom = (s: SourceNode): { floor: number; room: SceneFloor["rooms"][number] } | undefined => {
    for (let k = 0; k < floors.length; k++) {
      const room = floors[k].rooms.find((r) => r.node.consumers.some((c) => c.entity === s.entity));
      if (room) return { floor: k, room };
    }
    return undefined;
  };
  const batteryRooms = new Map(batteries.map((b) => [b.entity, batteryRoom(b)]));
  const roomBattery = (r: RoomNode): SourceNode | undefined => batteries.find((b) => batteryRooms.get(b.entity)?.room.node === r);

  const charging = localize(lang, "charging");
  const exporting = localize(lang, "export");
  const sourceValue = (s: SourceNode): string => {
    const text = format(Math.abs(s.watts));
    if (s.type === "battery" && s.reverse) return `${charging} ${text}`;
    if (s.type === "grid" && s.reverse) return `${exporting} ${text}`;
    return text;
  };

  // ---- boxes: ground, floors with their rooms
  const box = (b: Omit<SceneBox, "selected" | "dimmed"> & { selected?: boolean; dimmed?: boolean }): void => {
    boxes.push({ selected: false, dimmed: false, ...b });
  };
  const label = (l: Omit<SceneLabel, "dimmed"> & { dimmed?: boolean }): void => {
    labels.push({ dimmed: false, ...l });
  };

  // batteries without a room stand in a row to the back; with many of them the ground grows so that none hangs over its edge
  const loneCount = batteries.filter((b) => !batteryRooms.get(b.entity)).length;
  const rearmost = depth - BATTERY_BOX.size - BATTERY_BOX.gap - Math.max(0, loneCount - 1) * (BATTERY_BOX.size + BATTERY_BOX.gap);
  const groundBack = Math.max(GROUND.back, BATTERY_BOX.gap - rearmost);
  box({ key: "ground", kind: "ground", tone: "ground", x: -GROUND.left, y: -groundBack, z: GROUND.z, w: width + GROUND.left + GROUND.right, d: depth + groundBack + GROUND.front, h: 0 });

  floors.forEach((f, k) => {
    const id = f.node.id;
    const zb = k * PITCH;
    const dim = floorDim(id);
    const value = format(f.node.watts);
    box({
      key: `slab:${id || "home"}`,
      kind: "slab",
      tone: "wall",
      x: 0,
      y: 0,
      z: zb,
      w: width,
      d: depth,
      h: SLAB,
      floor_id: f.real ? id : undefined,
      selected: f.real && selection.floor_id === id && selArea === undefined,
      dimmed: dim,
      aria: f.real ? `${f.node.name}, ${value}` : undefined,
    });
    const placed = f.rooms.map(({ node, layout }) => ({
      node,
      w: layout.w * CELL - 2 * ROOM_INSET,
      d: layout.h * CELL - 2 * ROOM_INSET,
      x: layout.x * CELL + ROOM_INSET,
      y: layout.y * CELL + ROOM_INSET,
      z: zb + SLAB,
      h: ROOM_H,
    }));
    for (const { node, x, y, w, d } of drawOrder(placed)) {
      const battery = roomBattery(node);
      const kind: BoxKind = battery ? "battery" : "room";
      const tone: BoxTone = battery ? "battery" : "room";
      const text = battery ? sourceValue(battery) : format(node.watts);
      const rdim = roomDim(id, node.id);
      box({
        key: `room:${node.id}`,
        kind,
        tone,
        x,
        y,
        z: zb + SLAB,
        w,
        d,
        h: ROOM_H,
        floor_id: f.real ? id : undefined,
        area_id: node.id,
        selected: selArea === node.id,
        dimmed: rdim,
        aria: `${node.name}, ${text}`,
      });
      if (w >= ROOM_LABEL_MIN_W) {
        label({ key: `label:${node.id}`, kind: "room", at: [x + w / 2, y + d / 2, zb + SLAB + ROOM_H + 1], anchor: "middle", name: node.name, value: text, floor_id: f.real ? id : undefined, area_id: node.id, dimmed: rdim });
      }
    }
    if (f.real) {
      label({ key: `label:${id}`, kind: "floor", at: [0, depth, zb + SLAB / 2], anchor: "end", name: f.node.name, value, floor_id: id, dimmed: dim });
    }
  });

  // ---- roof with the solar modules
  const zr = floors.length * PITCH;
  const solarIds = solars.map((s) => s.entity);
  const solarDim = srcDimFor(solarIds);
  const solarSel = selSource !== undefined && solarIds.includes(selSource);
  const solarWatts = solars.reduce((s, x) => s + x.watts, 0);
  const solarPick = solars.length ? { source: solars[0].entity, selected: solarSel } : {};
  box({ key: "roof", kind: "slab", tone: "wall", x: 0, y: 0, z: zr, w: width, d: depth, h: ROOF_H, dimmed: solarDim, ...solarPick, ...(solars.length ? { aria: `${solars[0].name}, ${format(solarWatts)}` } : {}) });
  if (solars.length) {
    for (let a = 0; a < SOLAR_COLS; a++) {
      for (let b = 0; b < SOLAR_ROWS; b++) {
        box({ key: `solar:${a}:${b}`, kind: "solar", tone: "solar", x: SOLAR.x0 + a * SOLAR.stepX, y: SOLAR.y0 + b * SOLAR.stepY, z: zr + ROOF_H, w: SOLAR.w, d: SOLAR.d, h: SOLAR.h, dimmed: solarDim, ...solarPick });
      }
    }
    const watts = solars.reduce((s, x) => s + x.watts, 0);
    label({ key: "label:solar", kind: "source", at: [0, depth, zr + ROOF_H / 2], anchor: "end", name: solars[0].name, value: format(watts), dimmed: solarDim });
  }

  // ---- a battery without a room: a block of its own to the right of the riser
  const rx = width + RISER_OFFSET;
  const ry = depth / 2;
  const zl = (k: number): number => k * PITCH + SLAB + BRANCH_LIFT;
  const lone = batteries.filter((b) => !batteryRooms.get(b.entity));
  lone.forEach((b, i) => {
    const x = rx + BATTERY_BOX.gap;
    const y = depth - BATTERY_BOX.size - BATTERY_BOX.gap - i * (BATTERY_BOX.size + BATTERY_BOX.gap);
    box({ key: `battery:${b.entity}`, kind: "battery", tone: "battery", x, y, z: 0, w: BATTERY_BOX.size, d: BATTERY_BOX.size, h: BATTERY_BOX.h, aria: `${b.name}, ${sourceValue(b)}`, dimmed: srcDimFor([b.entity]), source: b.entity, selected: selSource === b.entity });
    label({ key: `label:battery:${b.entity}`, kind: "source", at: [x + BATTERY_BOX.size / 2, y + BATTERY_BOX.size / 2, BATTERY_BOX.h + 12], anchor: "middle", name: b.name, value: sourceValue(b), dimmed: srcDimFor([b.entity]) });
  });

  // ---- grid pole in front of the house
  const mastX = width - MAST_FROM_RIGHT;
  const mastY = depth + MAST_FRONT;
  if (grids.length) {
    const net = grids.reduce((s, g) => s + g.watts, 0);
    const first = { ...grids[0], watts: net, reverse: net < 0 };
    const gridIds = grids.map((g) => g.entity);
    const gridDim = srcDimFor(gridIds);
    const gridSel = selSource !== undefined && gridIds.includes(selSource);
    box({ key: "mast", kind: "mast", tone: "grid", x: mastX, y: mastY, z: 0, w: MAST.foot, d: MAST.foot, h: MAST.h, aria: `${first.name}, ${sourceValue(first)}`, dimmed: gridDim, source: first.entity, selected: gridSel });
    box({ key: "mast-arm", kind: "mast", tone: "grid", x: mastX - 10, y: mastY + 1, z: MAST.armZ, w: MAST.arm, d: 2, h: MAST.armH, dimmed: gridDim, source: first.entity, selected: gridSel });
    label({ key: "label:grid", kind: "source", at: [mastX + MAST.foot / 2, mastY + MAST.foot / 2, MAST.h + 4], anchor: "middle", name: first.name, value: sourceValue(first), dimmed: gridDim });
  }

  // ---- flow lines
  const mix = sourceMix(model);
  const lead = mix.find((m) => m.entity === dominantSource(mix));
  const fallbackColor = lead?.color ?? "var(--secondary-text-color, #9e9e9e)";
  /** color and width of a line: the source color (or the lead) with `lines_by_source`, else the threshold range, else the same */
  const style = (own: ThresholdConfig[] | undefined, level: ThresholdConfig[], watts: number, fallback: string): { color: string; width: number } => {
    const list = elementThresholds(own, level);
    const lit = !bySource && !isIdle(watts);
    const color = lit ? thresholdColor(list, watts) : undefined;
    if (!color) return { color: fallback, width: FLOW_W };
    return { color, width: thresholdWidth(list, watts) ?? FLOW_W + Math.min(thresholdLevel(list, watts), MAX_LEVEL) * LEVEL_STEP };
  };
  const flow = (key: string, watts: number, points: Vec3[], st: { color: string; width: number }, node: Vec3 | undefined, dimmed = false): void => {
    flows.push({ key, points, color: st.color, width: st.width, active: !isIdle(watts), node, dimmed });
  };

  if (solars.length) {
    const watts = solars.reduce((s, x) => s + x.watts, 0);
    const pts: Vec3[] = [[width - END_INSET, ry, zr + 4], [rx, ry, zr + 4], [rx, ry, zl(0)]];
    flow("solar:roof", watts, pts, style(solars[0].thresholds, th.source, watts, sourceColor(solars[0])), pts[0], solarDim);
  }
  generics.forEach((g, i) => {
    const y = ry + (i + 1) * LANE_STEP;
    const pts: Vec3[] = [[rx + RISER_OFFSET, y, zl(0)], [rx, y, zl(0)], [rx, ry, zl(0)]];
    flow(`generic:${g.entity}`, g.watts, pts, style(g.thresholds, th.source, g.watts, sourceColor(g)), pts[0], srcDimFor([g.entity]));
  });

  // branches of the riser to the floors; the lowest floor takes the solar lane so that the other lanes stay free
  floors.forEach((f, k) => {
    const y = k === 0 ? Math.round(depth * LANE_SOLAR) : ry;
    const pts: Vec3[] = k === 0 ? [[rx, ry, zl(0)], [rx, y, zl(0)], [width - END_INSET, y, zl(0)]] : [[rx, ry, zl(k)], [width - END_INSET, ry, zl(k)]];
    flow(`floor:${f.node.id || "home"}`, f.node.watts, pts, style(f.node.thresholds, th.floor, f.node.watts, fallbackColor), pts[pts.length - 1], floorDim(f.node.id));
  });

  // battery: charging runs from the riser into the battery, discharging back out of it
  batteries.forEach((b) => {
    const at = batteryRooms.get(b.entity);
    const k = at?.floor ?? 0;
    let pts: Vec3[];
    if (at) {
      const y = Math.round(at.room.layout.y * CELL + (at.room.layout.h * CELL) / 2);
      pts = [[rx, ry, zl(k)], [rx, y, zl(k)], [width - END_INSET, y, zl(k)]];
    } else {
      const idx = lone.indexOf(b);
      const boxY = depth - BATTERY_BOX.size - BATTERY_BOX.gap - idx * (BATTERY_BOX.size + BATTERY_BOX.gap) + BATTERY_BOX.size / 2;
      pts = [[rx, ry, zl(0)], [rx, boxY, zl(0)], [rx + BATTERY_BOX.gap, boxY, zl(0)]];
    }
    if (!b.reverse) pts = [...pts].reverse();
    const node = b.reverse ? pts[pts.length - 1] : pts[0];
    flow(`battery:${b.entity}`, b.watts, pts, style(b.thresholds, th.source, b.watts, sourceColor(b)), node, srcDimFor([b.entity]));
  });

  // grid: import runs from the pole into the house, feed-in back out
  if (grids.length) {
    const net = grids.reduce((s, g) => s + g.watts, 0);
    let pts: Vec3[] = [[mastX + MAST.foot / 2, mastY, zl(0)], [mastX + MAST.foot / 2, depth - GRID_ENTRY, zl(0)]];
    if (net < 0) pts = [...pts].reverse();
    flow("grid:feed", net, pts, style(grids[0].thresholds, th.source, net, sourceColor(grids[0])), pts[pts.length - 1], srcDimFor(grids.map((g) => g.entity)));
  }

  return { cols, rows, boxes, labels, flows };
}
