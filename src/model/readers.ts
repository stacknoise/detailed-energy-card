import type { Reader } from "./compute";
import { stateToPercent, stateToWatts, type StateLike } from "./units";

type States = Record<string, StateLike | undefined>;

/**
 * Power sensors (sources, consumers, home total). Anything that is not a power in W / kW / MW
 * (energy counters in kWh, voltages, a missing entity) is invalid and counts as 0 instead of
 * showing its raw number as watts.
 */
export const powerReader =
  (states: States): Reader =>
  (id) => {
    const watts = stateToWatts(states[id]);
    return watts === null ? { watts: 0, valid: false } : { watts, valid: true };
  };

/** State-of-charge sensors; the percentage is returned in `watts` (the Reading shape is shared). */
export const socReader =
  (states: States): Reader =>
  (id) => {
    const pct = stateToPercent(states[id]);
    return pct === null ? { watts: 0, valid: false } : { watts: pct, valid: true };
  };
