import type { SourceType } from "./config";
import type { EnergyModel, SourceNode } from "./compute";

/** Colors of the sources in the mix ring and the notes, as in the Energy dashboard of Home Assistant; a source `color` wins. */
export const SOURCE_COLORS: Record<SourceType, string> = {
  solar: "#ff9800",
  battery: "#f06292",
  grid: "#488fc2",
  generic: "#9e9e9e",
};

/** One source in the mix: who delivers how much of what the home draws. */
export interface MixSegment {
  entity: string;
  name: string;
  color: string;
  /** 0..1, the share of all delivering sources */
  share: number;
}

/** Shares below this are left out of the ring and the legend. */
export const MIN_MIX_SHARE = 0.005;
/** A source takes the color of the home value only when it leads by at least this share (hysteresis against flicker). */
export const DOMINANT_MARGIN = 0.05;

/**
 * The mix of the sources that deliver: solar, a discharging battery, grid import. In the energy mode the energy
 * of the period. Empty when nothing delivers.
 */
export function sourceMix(model: EnergyModel): MixSegment[] {
  return model.sources
    .filter((s) => s.share >= MIN_MIX_SHARE)
    .map((s) => ({ entity: s.entity, name: s.name, color: s.color ?? SOURCE_COLORS[s.type], share: s.share }));
}

/**
 * The source with the largest share. The previous leader keeps the lead until another one is ahead of it by
 * `DOMINANT_MARGIN`, so the color does not flicker when two sources are close. Undefined when nothing delivers.
 */
export function dominantSource(mix: MixSegment[], previous?: string): string | undefined {
  if (!mix.length) return undefined;
  const top = mix.reduce((best, s) => (s.share > best.share ? s : best), mix[0]);
  const prev = previous ? mix.find((s) => s.entity === previous) : undefined;
  if (!prev) return top.entity;
  return top.share >= prev.share + DOMINANT_MARGIN ? top.entity : prev.entity;
}

/** CSS `conic-gradient` of the mix, starting at the top; undefined when nothing delivers. */
export function mixGradient(mix: MixSegment[]): string | undefined {
  const total = mix.reduce((s, m) => s + m.share, 0);
  if (!mix.length || total <= 0) return undefined;
  let at = 0;
  const stops = mix.map((m) => {
    const from = at;
    at += (m.share / total) * 100;
    return `${m.color} ${from.toFixed(2)}% ${at.toFixed(2)}%`;
  });
  return `conic-gradient(from 0deg, ${stops.join(", ")})`;
}

/** What a battery will do at the current power: reach full, or run empty, at the time `at` (ms since epoch). */
export interface BatteryForecast {
  kind: "full" | "empty";
  at: number;
  /** minutes from now */
  minutes: number;
}

/** Below this power (W) a battery is idle and gets no forecast. */
export const FORECAST_MIN_W = 20;
/** A forecast further away than this (hours) is left out. */
export const FORECAST_MAX_H = 48;

/**
 * When a battery is full (charging) or empty (discharging) at the power it has now, from its state of charge
 * and its capacity in kWh. Undefined while idle, without a readable state of charge, without a capacity, when
 * it is already full or empty, or when the time is further away than `FORECAST_MAX_H`.
 */
export function batteryForecast(s: SourceNode, capacityKwh: number | undefined, now: number): BatteryForecast | undefined {
  if (s.type !== "battery" || !s.valid || s.soc === undefined || !capacityKwh || capacityKwh <= 0) return undefined;
  const watts = Math.abs(s.watts);
  if (watts < FORECAST_MIN_W) return undefined;
  const charging = s.watts < 0;
  const soc = Math.min(100, Math.max(0, s.soc));
  const kwhLeft = capacityKwh * ((charging ? 100 - soc : soc) / 100);
  if (kwhLeft <= 0.005) return undefined;
  const minutes = (kwhLeft / (watts / 1000)) * 60;
  if (minutes > FORECAST_MAX_H * 60) return undefined;
  return { kind: charging ? "full" : "empty", at: now + minutes * 60_000, minutes };
}

/** Where the solar power goes, in watts. */
export interface SolarSplit {
  produced: number;
  home: number;
  battery: number;
  grid: number;
}

/** Below this production (W) the split is left out. */
export const SPLIT_MIN_W = 50;

/**
 * Where the solar power goes right now: into the batteries that charge, into the grid (feed-in), and the rest
 * into the home. The measured flows come first, so the home gets what is left and does not depend on a
 * sensor of the home. Undefined without solar production (or when no solar source can be read).
 */
export function solarSplit(model: EnergyModel): SolarSplit | undefined {
  const solar = model.sources.filter((s) => s.type === "solar" && s.valid);
  const produced = solar.reduce((sum, s) => sum + Math.max(0, s.watts), 0);
  if (!solar.length || produced < SPLIT_MIN_W) return undefined;
  const charge = model.sources.filter((s) => s.type === "battery" && s.valid).reduce((sum, s) => sum + Math.max(0, -s.watts), 0);
  const feedIn = model.sources.filter((s) => s.type === "grid" && s.valid).reduce((sum, s) => sum + Math.max(0, -s.watts), 0);
  const battery = Math.min(produced, charge);
  const grid = Math.min(produced - battery, feedIn);
  return { produced, home: produced - battery - grid, battery, grid };
}
