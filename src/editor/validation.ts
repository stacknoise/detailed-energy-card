import type { EnergyCardConfig } from "../model/config";
import { computeModel } from "../model/compute";
import { stateToWatts, type StateLike } from "../model/units";
import type { Field } from "./schema";

const POWER_UNITS = ["W", "kW", "MW"];

/** Message for an unsuitable sensor, undefined when the sensor is fine or not set yet. */
export function checkSensor(
  states: Record<string, StateLike | undefined>,
  entityId: unknown,
  check: NonNullable<Field["check"]>,
): string | undefined {
  if (typeof entityId !== "string" || !entityId) return undefined;
  if (!entityId.startsWith("sensor.")) return "Nur sensor.* ist erlaubt";
  const st = states[entityId];
  if (!st) return "Entität nicht gefunden";
  const attrs = st.attributes;
  if (check === "power") {
    if (attrs.device_class !== "power") return "Kein Leistungssensor (device_class: power)";
    if (!POWER_UNITS.includes(String(attrs.unit_of_measurement))) return "Einheit muss W, kW oder MW sein";
  } else if (attrs.device_class !== "battery" && attrs.unit_of_measurement !== "%") {
    return "Kein Prozent-/Batteriesensor";
  }
  return undefined;
}

/** Errors for ha-form (`error` prop), keyed by field path. */
export function fieldErrors(
  obj: unknown,
  fields: Field[],
  states: Record<string, StateLike | undefined>,
  get: (o: unknown, path: string) => unknown,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const value = get(obj, f.path);
    const msg = f.check
      ? checkSensor(states, value, f.check)
      : f.kind === "color"
        ? colorError(value)
        : undefined;
    if (msg) errors[f.path] = msg;
  }
  return errors;
}

/** Accepts empty, "theme" and CSS hex colors. */
export function isValidColor(value: unknown): boolean {
  if (value === undefined || value === null || value === "" || value === "theme") return true;
  return typeof value === "string" && /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value);
}

export const colorError = (value: unknown): string | undefined =>
  isValidColor(value) ? undefined : "Ungültige Farbe (z. B. #9184d9)";

/** Set when the rooms use more power than the configured total sensor reports. */
export function sumConflict(
  cfg: EnergyCardConfig,
  states: Record<string, StateLike | undefined>,
): { rooms: number; total: number } | undefined {
  if (!cfg.home?.total_entity) return undefined;
  const model = computeModel(cfg, (id) => {
    const w = stateToWatts(states[id]);
    return w === null ? { watts: 0, valid: false } : { watts: w, valid: true };
  });
  if (!model.totalValid) return undefined;
  const rooms = model.floors.length
    ? model.floors.reduce((s, f) => s + f.watts, 0)
    : model.rooms.reduce((s, r) => s + r.watts, 0);
  return rooms > model.homeWatts + 1 ? { rooms, total: model.homeWatts } : undefined;
}
