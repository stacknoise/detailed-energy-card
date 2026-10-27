import type { EnergyPeriod } from "../model/energy";

/** Ways to draw the card: the tree of floors and rooms, a Sankey diagram, the course of the day. */
export const VIEW_IDS = ["tree", "sankey", "timeline"] as const;
export type ViewId = (typeof VIEW_IDS)[number];

/**
 * Views the card can draw so far. The tree is the only one; the timeline follows with package P7 and the
 * Sankey diagram with P9, together with the options `view` and `views` that choose among them.
 */
export const AVAILABLE_VIEWS: readonly ViewId[] = ["tree"];

export const VIEW_ICONS: Record<ViewId, string> = {
  tree: "mdi:file-tree",
  sankey: "mdi:chart-sankey",
  timeline: "mdi:chart-bar-stacked",
};

/** Views the switch offers: the wanted ones the card can draw, in their fixed order; the tree when none is left. */
export function offeredViews(wanted: readonly string[] | undefined, available: readonly ViewId[] = AVAILABLE_VIEWS): ViewId[] {
  const can = VIEW_IDS.filter((v) => available.includes(v));
  const out = wanted?.length ? can.filter((v) => wanted.includes(v)) : can.filter((v) => v === "tree");
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
