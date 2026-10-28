import { MAX_THRESHOLD_WIDTH, MIN_THRESHOLD_WIDTH, THRESHOLD_LEVELS, type LevelThresholds, type ThresholdConfig } from "./thresholds";
import { isValidColor } from "./colors";
import { actionError, type ActionConfig } from "./actions";

/** The three actions every element can have (Home Assistant standard); the default is what a click did before. */
export interface ActionFields {
  /** default: a source or consumer opens its more-info dialog, a floor or room is selected */
  tap_action?: ActionConfig;
  hold_action?: ActionConfig;
  double_tap_action?: ActionConfig;
}

export type SourceType = "solar" | "battery" | "grid" | "generic";

export interface SourceConfig extends ActionFields {
  entity: string;
  name?: string;
  type?: SourceType;
  icon?: string;
  color?: string;
  soc_entity?: string;
  invert?: boolean;
  /** energy counter (kWh) for the energy mode */
  energy_entity?: string;
  /** energy counter of the other direction (kWh) for the energy mode: grid feed-in, battery charged; not for solar */
  energy_entity_return?: string;
  /** own thresholds for the line of this source (replace the level thresholds) */
  thresholds?: ThresholdConfig[];
}

export interface ConsumerConfig extends ActionFields {
  /** power sensor (W); optional when `energy_entity` is set: the consumer then only shows in the energy mode */
  entity?: string;
  name?: string;
  /** energy counter (kWh) for the energy mode */
  energy_entity?: string;
  /** own thresholds for the bar of this consumer */
  thresholds?: ThresholdConfig[];
  /** a switch (switch, input_boolean, light, fan) of the consumer: the list shows a toggle at the end of its row */
  switch_entity?: string;
  /** ask before the switch is turned off */
  confirm_switch?: boolean;
  /** icon of the node of a consumer directly under the home (default mdi:flash) */
  icon?: string;
}

/** Rooms are Home Assistant areas; name and icon are resolved from the area registry. */
export interface RoomConfig extends ActionFields {
  area_id: string;
  /** from the Home Assistant registry; for an id that is not in it (a custom room), the name shown instead of the id */
  name?: string;
  icon?: string;
  color?: string;
  /** own thresholds for the line to this room */
  thresholds?: ThresholdConfig[];
  /** own power meter of the room (W); without it the room shows the sum of its consumers */
  entity?: string;
  /** own energy counter of the room (kWh) for the energy mode */
  energy_entity?: string;
  consumers?: ConsumerConfig[];
}

/** Floors are Home Assistant floors; name and icon are resolved from the floor registry. */
export interface FloorConfig extends ActionFields {
  floor_id: string;
  /** from the Home Assistant registry; for an id that is not in it (a custom room), the name shown instead of the id */
  name?: string;
  icon?: string;
  color?: string;
  /** own thresholds for the line to this floor */
  thresholds?: ThresholdConfig[];
  /** own power meter of the floor (W), e.g. of its distribution board; without it the floor shows the sum of its rooms */
  entity?: string;
  /** own energy counter of the floor (kWh) for the energy mode */
  energy_entity?: string;
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
  /** color of lines and bars by power range, in watts */
  thresholds?: ThresholdConfig[];
  /** own thresholds per level (source, floor, room, consumer); unset levels use `thresholds` */
  level_thresholds?: LevelThresholds;
}

export interface OptionsConfig {
  unit?: "auto" | "W" | "kW";
  decimals?: number;
  animation?: boolean;
  show_unassigned?: boolean;
  /** show the list of consumers under the diagram (default true) */
  show_consumers?: boolean;
  /** list only consumers that draw power (1 W or more); sensors that cannot be read stay listed as warnings */
  only_active_consumers?: boolean;
  /** show the entity id under the name of a consumer in the list (default true); warnings like "No power sensor" stay */
  show_entity_ids?: boolean;
  remember_selection?: boolean;
  /** tells cards with the same floors and rooms apart in the remembered selection (default: none) */
  storage_id?: string;
  wrap_rooms?: boolean;
  /** the selected floor / room slides to the middle under its parent, the others of its level fade out */
  focus_selected?: boolean;
  /** what the card shows when it loads: the power now, or the energy of a period (default power) */
  mode?: "power" | "energy";
  /** the badge "self-consumption" next to the self-sufficiency, when it can be computed (default true) */
  show_self_consumption?: boolean;
  /** the compact view: only sources, home and floors (without floors: rooms) with smaller circles; no consumer list, no view switch; a click opens the dialog of the node's sensor (default off) */
  compact?: boolean;
  /** the badge "base load" in the head: the lowest hourly mean of the home between 1 and 5 o'clock in the last 7 nights (default off) */
  show_base_load?: boolean;
  /** a consumer whose hourly mean did not fall below this many watts in the last 24 hours gets the symbol "runs all the time" (default off) */
  standby_watts?: number;
  /** periods the switch offers in the energy mode (default all) */
  energy_periods?: Array<"today" | "week" | "month">;
  /** what the card draws when it loads: the tree, the Sankey diagram or the timeline (default tree; the timeline needs an energy sensor) */
  view?: "tree" | "sankey" | "timeline";
  /** the views the view switch offers (default only `view`, then there is no switch); must contain `view` */
  views?: Array<"tree" | "sankey" | "timeline">;
  /**
   * a second, smaller value under every node and in the consumer list (default none): "today" shows the
   * energy of today in the power mode, "power" the power now in the energy mode, "auto" both
   */
  secondary_value?: SecondaryValue;
  /** fixed price per kWh drawn from the grid; enables the costs (needs an energy counter on the grid) */
  price?: number;
  /** price sensor per kWh (dynamic tariff, recorded as statistics); instead of `price` */
  price_entity?: string;
  /** currency of the prices (default the currency of Home Assistant) */
  currency?: string;
  /** fixed compensation per kWh fed into the grid (needs `energy_entity_return` on the grid) */
  feed_in_price?: number;
  /** sensor of the compensation per kWh; instead of `feed_in_price` */
  feed_in_price_entity?: string;
}

/** "cost": the costs of the shown period (power mode: of today), with `price` or `price_entity` */
export const SECONDARY_VALUES = ["none", "auto", "today", "power", "cost"] as const;
/** views that can be configured so far (the Sankey diagram follows with P9) */
export const CONFIG_VIEWS = ["tree", "sankey", "timeline"] as const;
export type SecondaryValue = (typeof SECONDARY_VALUES)[number];

export interface EnergyCardConfig {
  type: string;
  title?: string;
  home?: { total_entity?: string; total_energy_entity?: string };
  sources?: SourceConfig[];
  floors?: FloorConfig[];
  rooms?: RoomConfig[];
  /** consumers that belong to no room or floor: they hang directly under the home */
  consumers?: ConsumerConfig[];
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

/** `value` must be a list (or absent); returns it as an array for iteration. */
function list(value: unknown, where: string): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ConfigError(`${where} must be a list`);
  return value;
}

function checkColor(value: unknown, where: string): void {
  if (!isValidColor(value)) {
    throw new ConfigError(`${where}: "${String(value)}" is not a color (use e.g. #9184d9, rgb(…), red or var(--primary-color))`);
  }
}

/** Faulty `tap_action`, `hold_action` or `double_tap_action` of an element. */
function checkActions(o: Record<string, unknown>, where: string): void {
  for (const key of ["tap_action", "hold_action", "double_tap_action"]) {
    const message = actionError(o[key], `${where}.${key}`);
    if (message) throw new ConfigError(message);
  }
}

const SWITCH_DOMAINS = ["switch", "input_boolean", "light", "fan"];

function checkSwitch(id: unknown, where: string): void {
  if (typeof id !== "string" || !new RegExp(`^(${SWITCH_DOMAINS.join("|")})\\.[a-z0-9_]+$`).test(id)) {
    throw new ConfigError(`${where}: "${String(id)}" is not a switch (${SWITCH_DOMAINS.join(", ")})`);
  }
}

function checkBool(value: unknown, where: string): void {
  if (value !== undefined && typeof value !== "boolean") throw new ConfigError(`${where} must be true or false`);
}

function checkRoom(room: unknown, where: string): void {
  if (!isObj(room) || typeof room.area_id !== "string" || !room.area_id) {
    throw new ConfigError(`${where}: room needs an area_id (a Home Assistant area)`);
  }
  checkColor(room.color, `${where}.color`);
  checkThresholds(room.thresholds, `${where}.thresholds`);
  checkActions(room, where);
  if (room.entity) checkEntity(room.entity, `${where}.entity`);
  if (room.energy_entity) checkEntity(room.energy_entity, `${where}.energy_entity`);
  list(room.consumers, `${where}.consumers`).forEach((c, i) => checkConsumer(c, `${where}.consumers[${i}]`));
}

function checkConsumer(c: unknown, where: string): void {
  // a consumer needs a power sensor, an energy counter, or both
  if (isObj(c) && (c.entity === undefined || c.entity === null || c.entity === "") && c.energy_entity) {
    /* only an energy counter: fine */
  } else if (isObj(c) && !c.entity && !c.energy_entity) {
    throw new ConfigError(`${where}: entity or energy_entity is required`);
  } else {
    checkEntity(isObj(c) ? c.entity : undefined, where);
  }
  if (isObj(c) && c.energy_entity) checkEntity(c.energy_entity, `${where}.energy_entity`);
  if (isObj(c)) checkThresholds(c.thresholds, `${where}.thresholds`);
  if (isObj(c)) checkActions(c, where);
  if (isObj(c) && c.switch_entity !== undefined && c.switch_entity !== "") checkSwitch(c.switch_entity, `${where}.switch_entity`);
  if (isObj(c)) checkBool(c.confirm_switch, `${where}.confirm_switch`);
}

const UNITS = ["auto", "W", "kW"];
const MODES = ["power", "energy"];
export const ENERGY_PERIODS = ["today", "week", "month"] as const;
export type EnergyPeriod = (typeof ENERGY_PERIODS)[number];
/** Decimal places: Intl.NumberFormat accepts 0..20 everywhere; the editor offers 0..4. */
export const MAX_DECIMALS = 20;
const MAX_STORAGE_ID = 64;
const COLOR_KEYS = ["accent", "flow", "inactive", "bar", "background", "text"] as const;
const PRESETS = ["theme", "nocturne", "custom"];

function checkOptions(options: unknown): void {
  if (options === undefined || options === null) return;
  if (!isObj(options)) throw new ConfigError("options must be a mapping");
  if (options.unit !== undefined && !UNITS.includes(options.unit as string)) {
    throw new ConfigError(`options.unit: "${String(options.unit)}" must be one of ${UNITS.join(", ")}`);
  }
  const d = options.decimals;
  if (d !== undefined && (typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > MAX_DECIMALS)) {
    throw new ConfigError(`options.decimals must be a whole number from 0 to ${MAX_DECIMALS}`);
  }
  if (options.mode !== undefined && !MODES.includes(options.mode as string)) {
    throw new ConfigError(`options.mode: "${String(options.mode)}" must be one of ${MODES.join(", ")}`);
  }
  if (options.secondary_value !== undefined && !(SECONDARY_VALUES as readonly unknown[]).includes(options.secondary_value)) {
    throw new ConfigError(`options.secondary_value: "${String(options.secondary_value)}" must be one of ${SECONDARY_VALUES.join(", ")}`);
  }
  if (options.view !== undefined && !(CONFIG_VIEWS as readonly unknown[]).includes(options.view)) {
    throw new ConfigError(`options.view: "${String(options.view)}" must be one of ${CONFIG_VIEWS.join(", ")}`);
  }
  const views = list(options.views, "options.views");
  views.forEach((v, i) => {
    if (!(CONFIG_VIEWS as readonly unknown[]).includes(v)) {
      throw new ConfigError(`options.views[${i}]: "${String(v)}" must be one of ${CONFIG_VIEWS.join(", ")}`);
    }
  });
  if (options.view !== undefined && views.length && !views.includes(options.view)) {
    throw new ConfigError(`options.view: "${String(options.view)}" must be one of options.views`);
  }
  list(options.energy_periods, "options.energy_periods").forEach((p, i) => {
    if (!(ENERGY_PERIODS as readonly unknown[]).includes(p)) {
      throw new ConfigError(`options.energy_periods[${i}]: "${String(p)}" must be one of ${ENERGY_PERIODS.join(", ")}`);
    }
  });
  const id = options.storage_id;
  if (id !== undefined && (typeof id !== "string" || !id || id.length > MAX_STORAGE_ID)) {
    throw new ConfigError(`options.storage_id must be text of 1 to ${MAX_STORAGE_ID} characters`);
  }
  for (const key of ["animation", "show_unassigned", "show_self_consumption", "show_consumers", "only_active_consumers", "show_entity_ids", "remember_selection", "wrap_rooms", "focus_selected", "show_base_load", "compact"]) {
    checkBool(options[key], `options.${key}`);
  }
  const standby = options.standby_watts;
  if (standby !== undefined && (typeof standby !== "number" || !Number.isFinite(standby) || standby <= 0)) {
    throw new ConfigError("options.standby_watts must be a number greater than 0 (watts)");
  }
  // a price is fixed or comes from a sensor, never both
  for (const [fixed, entity] of [["price", "price_entity"], ["feed_in_price", "feed_in_price_entity"]] as const) {
    const v = options[fixed];
    if (v !== undefined && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) {
      throw new ConfigError(`options.${fixed} must be a number of 0 or more (price per kWh)`);
    }
    if (options[entity] !== undefined) checkEntity(options[entity], `options.${entity}`);
    if (v !== undefined && options[entity] !== undefined) throw new ConfigError(`options.${fixed} and options.${entity}: use one of them, not both`);
  }
  const cur = options.currency;
  if (cur !== undefined && (typeof cur !== "string" || !/^[A-Z]{3}$/.test(cur))) {
    throw new ConfigError(`options.currency must be a three-letter currency code like EUR`);
  }
}

/** The costs are configured: a fixed price or a price sensor. */
export const hasPrice = (cfg: EnergyCardConfig): boolean => cfg.options?.price !== undefined || !!cfg.options?.price_entity;

function checkColors(colors: unknown): void {
  if (colors === undefined || colors === null) return;
  if (!isObj(colors)) throw new ConfigError("colors must be a mapping");
  if (colors.preset !== undefined && !PRESETS.includes(colors.preset as string)) {
    throw new ConfigError(`colors.preset: "${String(colors.preset)}" must be one of ${PRESETS.join(", ")}`);
  }
  for (const key of COLOR_KEYS) checkColor(colors[key], `colors.${key}`);
  checkThresholds(colors.thresholds, "colors.thresholds");
  const perLevel = colors.level_thresholds;
  if (perLevel === undefined || perLevel === null) return;
  if (!isObj(perLevel)) throw new ConfigError("colors.level_thresholds must be a mapping");
  for (const [level, value] of Object.entries(perLevel)) {
    if (!(THRESHOLD_LEVELS as readonly string[]).includes(level)) {
      throw new ConfigError(`colors.level_thresholds.${level}: level must be one of ${THRESHOLD_LEVELS.join(", ")}`);
    }
    checkThresholds(value, `colors.level_thresholds.${level}`);
  }
}

function checkThresholds(value: unknown, path: string): void {
  list(value, path).forEach((t, i) => {
    if (!isObj(t) || typeof t.from !== "number" || !Number.isFinite(t.from) || t.from < 0) {
      throw new ConfigError(`${path}[${i}].from must be a number of watts (0 or more)`);
    }
    if (typeof t.color !== "string" || !t.color) throw new ConfigError(`${path}[${i}].color is required`);
    checkColor(t.color, `${path}[${i}].color`);
    const w = t.width;
    if (w !== undefined && (typeof w !== "number" || !Number.isFinite(w) || w < MIN_THRESHOLD_WIDTH || w > MAX_THRESHOLD_WIDTH)) {
      throw new ConfigError(`${path}[${i}].width must be a number from ${MIN_THRESHOLD_WIDTH} to ${MAX_THRESHOLD_WIDTH} (pixels)`);
    }
  });
}

/** A sensor (power or energy) may be assigned to one slot only: a consumer, or the meter of a room or a floor. */
function checkUniqueConsumers(cfg: EnergyCardConfig): void {
  const seen = new Map<string, string>();
  const claim = (id: string, where: string) => {
    const first = seen.get(id);
    if (first) throw new ConfigError(`${where}: "${id}" is already assigned to ${first}; a sensor can be assigned only once`);
    seen.set(id, where);
  };
  const meters = (m: { entity?: string; energy_entity?: string }, where: string) => {
    if (m.entity) claim(m.entity, `${where}.entity`);
    if (m.energy_entity) claim(m.energy_entity, `${where}.energy_entity`);
  };
  const scan = (rooms: RoomConfig[] | undefined, prefix: string) =>
    (rooms ?? []).forEach((r, i) => {
      meters(r, `${prefix}[${i}]`);
      (r.consumers ?? []).forEach((c, j) => {
        const where = `${prefix}[${i}].consumers[${j}]`;
        if (c.entity) claim(c.entity, where);
        if (c.energy_entity) claim(c.energy_entity, `${where}.energy_entity`);
      });
    });
  scan(cfg.rooms, "rooms");
  (cfg.consumers ?? []).forEach((c, i) => {
    const where = `consumers[${i}]`;
    if (c.entity) claim(c.entity, where);
    if (c.energy_entity) claim(c.energy_entity, `${where}.energy_entity`);
  });
  (cfg.floors ?? []).forEach((f, i) => {
    meters(f, `floors[${i}]`);
    scan(f.rooms, `floors[${i}].rooms`);
  });
}

/** Validates a raw Lovelace config; throws ConfigError with a readable message. */
export function validateConfig(raw: unknown): EnergyCardConfig {
  if (!isObj(raw)) throw new ConfigError("Invalid configuration");
  if (raw.title !== undefined && typeof raw.title !== "string") throw new ConfigError("title must be text");

  const sources = list(raw.sources, "sources");
  const floors = list(raw.floors, "floors");
  const rooms = list(raw.rooms, "rooms");
  if (floors.length && rooms.length) {
    throw new ConfigError("Use either `floors` or `rooms` on the top level, not both");
  }

  if (raw.home !== undefined && raw.home !== null) {
    if (!isObj(raw.home)) throw new ConfigError("home must be a mapping");
    if (raw.home.total_entity) checkEntity(raw.home.total_entity, "home.total_entity");
    if (raw.home.total_energy_entity) checkEntity(raw.home.total_energy_entity, "home.total_energy_entity");
  }

  sources.forEach((s, i) => {
    if (!isObj(s)) throw new ConfigError(`sources[${i}] must be a mapping with an entity`);
    checkEntity(s.entity, `sources[${i}].entity`);
    if (s.energy_entity) checkEntity(s.energy_entity, `sources[${i}].energy_entity`);
    if (s.energy_entity_return) {
      checkEntity(s.energy_entity_return, `sources[${i}].energy_entity_return`);
      if (s.type === "solar") throw new ConfigError(`sources[${i}].energy_entity_return: only for the types grid, battery and generic`);
    }
    if (s.type && !SOURCE_TYPES.includes(s.type as SourceType)) {
      throw new ConfigError(`sources[${i}].type: unknown type "${String(s.type)}"`);
    }
    if (s.soc_entity) checkEntity(s.soc_entity, `sources[${i}].soc_entity`);
    checkBool(s.invert, `sources[${i}].invert`);
    checkColor(s.color, `sources[${i}].color`);
    checkThresholds(s.thresholds, `sources[${i}].thresholds`);
    checkActions(s, `sources[${i}]`);
  });

  checkColors(raw.colors);
  checkOptions(raw.options);

  floors.forEach((f, i) => {
    if (!isObj(f) || typeof f.floor_id !== "string" || !f.floor_id) {
      throw new ConfigError(`floors[${i}]: floor needs a floor_id (a Home Assistant floor)`);
    }
    checkColor(f.color, `floors[${i}].color`);
    checkThresholds(f.thresholds, `floors[${i}].thresholds`);
    checkActions(f, `floors[${i}]`);
    if (f.entity) checkEntity(f.entity, `floors[${i}].entity`);
    if (f.energy_entity) checkEntity(f.energy_entity, `floors[${i}].energy_entity`);
    list(f.rooms, `floors[${i}].rooms`).forEach((r, j) => checkRoom(r, `floors[${i}].rooms[${j}]`));
  });
  rooms.forEach((r, i) => checkRoom(r, `rooms[${i}]`));
  list(raw.consumers, "consumers").forEach((c, i) => checkConsumer(c, `consumers[${i}]`));

  const cfg = raw as unknown as EnergyCardConfig;
  checkUniqueConsumers(cfg);
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
  for (const f of cfg.floors ?? []) if (f.entity) ids.add(f.entity);
  for (const c of cfg.consumers ?? []) {
    if (c.entity) ids.add(c.entity);
    if (c.switch_entity) ids.add(c.switch_entity);
  }
  const rooms = [...(cfg.rooms ?? []), ...(cfg.floors ?? []).flatMap((f) => f.rooms ?? [])];
  for (const r of rooms) {
    if (r.entity) ids.add(r.entity);
    for (const c of r.consumers ?? []) {
      if (c.entity) ids.add(c.entity);
      // the state of a switch is shown, so a change of it has to render the card
      if (c.switch_entity) ids.add(c.switch_entity);
    }
  }
  return [...ids];
}

/** True when at least one element has an energy sensor, so the card can offer the energy mode. */
export function hasEnergy(cfg: EnergyCardConfig): boolean {
  const rooms = [...(cfg.rooms ?? []), ...(cfg.floors ?? []).flatMap((f) => f.rooms ?? [])];
  return (
    !!cfg.home?.total_energy_entity ||
    (cfg.sources ?? []).some((s) => !!s.energy_entity) ||
    (cfg.floors ?? []).some((f) => !!f.energy_entity) ||
    (cfg.consumers ?? []).some((c) => !!c.energy_entity) ||
    rooms.some((r) => !!r.energy_entity || (r.consumers ?? []).some((c) => !!c.energy_entity))
  );
}

/** All energy sensors of the config (their statistics are requested together). */
export function collectEnergyIds(cfg: EnergyCardConfig): string[] {
  const ids = new Set<string>();
  if (cfg.home?.total_energy_entity) ids.add(cfg.home.total_energy_entity);
  for (const s of cfg.sources ?? []) {
    if (s.energy_entity) ids.add(s.energy_entity);
    if (s.energy_entity_return) ids.add(s.energy_entity_return);
  }
  for (const f of cfg.floors ?? []) if (f.energy_entity) ids.add(f.energy_entity);
  for (const c of cfg.consumers ?? []) if (c.energy_entity) ids.add(c.energy_entity);
  const rooms = [...(cfg.rooms ?? []), ...(cfg.floors ?? []).flatMap((f) => f.rooms ?? [])];
  for (const r of rooms) {
    if (r.energy_entity) ids.add(r.energy_entity);
    for (const c of r.consumers ?? []) if (c.energy_entity) ids.add(c.energy_entity);
  }
  return [...ids];
}
