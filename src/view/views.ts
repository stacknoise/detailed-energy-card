import type { EnergyPeriod } from "../model/energy";

/** Ways to draw the card: the tree of floors and rooms, a Sankey diagram, the course of the day. */
export const VIEW_IDS = ["tree", "sankey", "timeline"] as const;
export type ViewId = (typeof VIEW_IDS)[number];

/** Views the card can draw so far; the Sankey diagram follows with package P9. */
export const AVAILABLE_VIEWS: readonly ViewId[] = ["tree", "timeline"];

/** Views that need energy statistics: without an energy sensor they are not offered. */
export const ENERGY_VIEWS: readonly ViewId[] = ["timeline"];

export const VIEW_ICONS: Record<ViewId, string> = {
  tree: "mdi:file-tree",
  sankey: "mdi:chart-sankey",
  timeline: "mdi:chart-bar-stacked",
};

/**
 * Views the switch offers, in their fixed order: `options.views` when it is set, else only `options.view`
 * (default the tree). Views the card cannot draw, and energy views without energy sensors, are left out;
 * the tree remains when nothing is left.
 */
export function offeredViews(
  view: string | undefined,
  views: readonly string[] | undefined,
  energy = true,
  available: readonly ViewId[] = AVAILABLE_VIEWS,
): ViewId[] {
  const wanted = views?.length ? views : [view ?? "tree"];
  const out = VIEW_IDS.filter((v) => available.includes(v) && wanted.includes(v) && (energy || !ENERGY_VIEWS.includes(v)));
  return out.length ? out : ["tree"];
}

/** What the card showed last time: mode, period and view, as far as they are still offered. */
export interface ShownState {
  mode?: "power" | "energy";
  period?: EnergyPeriod;
  view?: ViewId;
}

/** Reads the remembered state; anything unknown or no longer offered is left out. */
export function parseShown(raw: string | null, periods: readonly EnergyPeriod[], views: readonly ViewId[]): ShownState {
  let v: { mode?: unknown; period?: unknown; view?: unknown } | null;
  try {
    v = JSON.parse(raw ?? "null");
  } catch {
    return {};
  }
  if (!v || typeof v !== "object") return {};
  const out: ShownState = {};
  if (v.mode === "power" || v.mode === "energy") out.mode = v.mode;
  if (periods.includes(v.period as EnergyPeriod)) out.period = v.period as EnergyPeriod;
  if (views.includes(v.view as ViewId)) out.view = v.view as ViewId;
  return out;
}
