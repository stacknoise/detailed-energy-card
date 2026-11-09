import type { EnergyModel } from "./compute";

/** A hint about data that does not add up. */
export interface Hint {
  kind: "balance" | "rooms" | "unavailable";
  /** balance: watts the sources deliver minus what the home uses (positive: more delivered); rooms: watts the rooms measure above the home; unavailable: the number of sensors */
  value: number;
}

/** The balance of sources and home is off when it is more than this many watts ... */
export const BALANCE_MIN_W = 400;
/** ... and more than this share of the consumption of the home. */
export const BALANCE_SHARE = 0.3;
/** Rooms and consumers measure more than the home meter when they are this much above it ... */
export const ROOMS_OVER_SHARE = 0.15;
/** ... and at least this many watts. */
export const ROOMS_OVER_MIN_W = 100;

/**
 * Hints about readings that do not fit together, in the power mode: the sources deliver much more or less than
 * the home uses (a sensor with the wrong sign or a missing source), the rooms and consumers add up to clearly more
 * than the meter of the home, and sensors that cannot be read. Without a reading there is no hint of the first
 * two kinds, so a sensor that is unavailable does not set them off a second time.
 */
export function plausibilityHints(model: EnergyModel): Hint[] {
  const out: Hint[] = [];
  const allValid = model.sources.length > 0 && model.sources.every((s) => s.valid);
  if (allValid && model.totalValid) {
    const delivered = model.sources.reduce((sum, s) => sum + s.flow, 0);
    const diff = delivered - model.homeWatts;
    if (Math.abs(diff) > BALANCE_MIN_W && Math.abs(diff) > model.homeWatts * BALANCE_SHARE) out.push({ kind: "balance", value: diff });
  }
  if (model.totalValid) {
    const parts = (model.floors.length ? model.floors.map((f) => f.watts) : model.rooms.map((r) => r.watts)).concat(model.consumers.map((c) => c.watts));
    const sum = parts.reduce((a, b) => a + b, 0);
    const over = sum - model.homeWatts;
    if (over >= ROOMS_OVER_MIN_W && over > model.homeWatts * ROOMS_OVER_SHARE) out.push({ kind: "rooms", value: over });
  }
  const bad = model.sources.filter((s) => !s.valid && !s.noEnergy).length;
  if (bad > 0) out.push({ kind: "unavailable", value: bad });
  return out;
}
