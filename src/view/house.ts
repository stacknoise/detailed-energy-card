import { svg, type TemplateResult } from "lit";
import { project, type HouseScene } from "../model/house";

/** What the view needs from the card besides the scene. */
export interface HouseViewContext {
  /** the card is narrower than NARROW_PX: no room labels */
  narrow: boolean;
  /** flow lines move (options.animation, no prefers-reduced-motion, card visible) */
  animate: boolean;
  /** a floor or room was tapped; both undefined clears the selection */
  onSelect(target: { floor_id?: string; area_id?: string }): void;
  /** tap-and-hold and double tap, same gestures as in the energy card */
  onAction?(target: { floor_id?: string; area_id?: string }, kind: "hold" | "double"): void;
}

/** AP3: draws the scene as SVG. For now an empty SVG with the 12 x 6 corner points, so the card has something to mount. */
export function renderHouse(scene: HouseScene, _ctx: HouseViewContext): TemplateResult {
  const [x, y] = project([0, 0, 0]);
  return svg`<svg viewBox="${x - 12} ${y - 12} 24 24" role="img" data-cols=${scene.cols} data-rows=${scene.rows}></svg>`;
}
