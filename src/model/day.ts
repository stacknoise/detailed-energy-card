import type { ConsumerNode, EnergyModel } from "./compute";

/** Banner "surplus": from this feed-in power (W) on, when `options.surplus_min_w` is not set. */
export const SURPLUS_DEFAULT_W = 500;
/** A shown banner stays until the feed-in falls below this share of the limit (hysteresis against flicker). */
export const SURPLUS_KEEP = 0.8;

/** The power that goes into the grid right now and what using it at home instead would save per hour. */
export interface Surplus {
  /** watts fed into the grid */
  watts: number;
  /** currency per hour saved when the power is used at home; undefined without a price */
  savedPerHour?: number;
}

/**
 * The feed-in of all grid sources (power mode), when it reaches `minW`. A banner that is already shown stays
 * until the feed-in falls below `SURPLUS_KEEP` of the limit. `price` and `feedIn` are the prices per kWh: using
 * a kilowatt hour at home saves the price of the grid and gives up the compensation.
 */
export function surplusOf(model: EnergyModel, minW: number, wasShown: boolean, price?: number, feedIn?: number): Surplus | undefined {
  const watts = model.sources.filter((s) => s.type === "grid" && s.valid).reduce((sum, s) => sum + Math.max(0, -s.watts), 0);
  if (watts < (wasShown ? minW * SURPLUS_KEEP : minW)) return undefined;
  const saved = price !== undefined ? Math.max(0, price - (feedIn ?? 0)) * (watts / 1000) : undefined;
  return { watts, savedPerHour: saved };
}

/** One tile of the bar of today's values. */
export interface DayTile {
  kind: "solar" | "import" | "export" | "battery" | "home" | "autarky";
  /** watt hours (home, solar, grid); for the battery the charged part; the self-sufficiency in `share` */
  wh: number;
  /** battery: watt hours discharged */
  whOut?: number;
  /** autarky: 0..1 */
  share?: number;
}

/**
 * Today's values from the energy model of the day: solar produced, drawn from the grid, fed in, battery charged
 * and discharged, home consumption and self-sufficiency. A tile whose source is not configured, or whose sensor
 * cannot be read, is left out.
 */
export function dayTiles(model: EnergyModel): DayTile[] {
  const out: DayTile[] = [];
  const of = (type: string) => model.sources.filter((s) => s.type === type && s.valid && !s.noEnergy);
  const solar = of("solar");
  if (solar.length) out.push({ kind: "solar", wh: solar.reduce((sum, s) => sum + Math.max(0, s.watts), 0) });
  const grid = of("grid");
  if (grid.length) {
    out.push({ kind: "import", wh: grid.reduce((sum, s) => sum + Math.max(0, s.watts), 0) });
    if (grid.some((s) => s.returnCounter)) out.push({ kind: "export", wh: grid.reduce((sum, s) => sum + (s.returned ?? 0), 0) });
  }
  const battery = of("battery");
  if (battery.some((s) => s.returnCounter)) {
    out.push({ kind: "battery", wh: battery.reduce((sum, s) => sum + (s.returned ?? 0), 0), whOut: battery.reduce((sum, s) => sum + Math.max(0, s.watts), 0) });
  }
  if (model.homeWatts > 0) out.push({ kind: "home", wh: model.homeWatts });
  if (model.autarky !== null) out.push({ kind: "autarky", wh: 0, share: model.autarky });
  return out;
}

/** A consumer the surplus could run. */
export interface SurplusDevice {
  entity: string;
  name?: string;
  /** typical power in watts */
  watts: number;
  switchEntity?: string;
  confirmSwitch?: boolean;
}

/** At most this many devices are suggested. */
export const SURPLUS_DEVICES_MAX = 3;
/** A consumer is idle below this power (W). */
export const SURPLUS_IDLE_W = 10;

/**
 * Idle consumers with a typical power (`surplus_w`) that fits into the surplus: the biggest ones that fit come
 * first, at most `SURPLUS_DEVICES_MAX`. Consumers under rooms (with or without floors) and directly under the home are all considered.
 */
export function surplusDevices(model: EnergyModel, surplusW: number): SurplusDevice[] {
  const all: ConsumerNode[] = [...model.floors.flatMap((f) => f.rooms.flatMap((r) => r.consumers)), ...model.rooms.flatMap((r) => r.consumers), ...model.consumers];
  return all
    .filter((c) => c.valid && !c.noSensor && c.surplusW !== undefined && c.surplusW <= surplusW && c.watts < SURPLUS_IDLE_W)
    .sort((a, b) => (b.surplusW ?? 0) - (a.surplusW ?? 0))
    .slice(0, SURPLUS_DEVICES_MAX)
    .map((c) => ({ entity: c.entity, name: c.name, watts: c.surplusW ?? 0, switchEntity: c.switchEntity, confirmSwitch: c.confirmSwitch }));
}
