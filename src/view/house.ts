import { nothing, svg, type SVGTemplateResult, type TemplateResult } from "lit";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import { Gesture } from "./gesture";
import { HOUSE_CSS } from "./house-styles";
import { localize } from "../localize";
import { NODE_R as NODE_RADIUS, project, type HouseScene, type HouseSelection, type SceneBox, type SceneFlow, type SceneLabel, type Vec3 } from "../model/house";

/** What the view needs from the card besides the scene. */
export interface HouseViewContext {
  /** the card is narrower than NARROW_PX: no room labels */
  narrow: boolean;
  /** flow lines move (options.animation, no prefers-reduced-motion, card visible) */
  animate: boolean;
  /** a floor, room or power source was tapped; all undefined clears the selection */
  onSelect(target: HouseSelection): void;
  /** tap-and-hold and double tap, same gestures as in the energy card */
  onAction?(target: HouseSelection, kind: "hold" | "double"): void;
  /**
   * Whether the target has a hold or double tap action. Without a double tap action a tap selects at once instead of
   * waiting for a second tap. When the card gives no answer, both are assumed whenever `onAction` is set.
   */
  hasAction?(target: HouseSelection, kind: "hold" | "double"): boolean;
  /** language for the aria label of the graphic */
  lang?: string;
}

/** Space around the drawing in scene units (the mock uses 12). */
export const VIEW_PAD = 12;
/** Stroke width of the wide, faint line under a flow line is this much more than the line itself (mock: 5 under 2). */
export const FLOW_UNDERLAY = 3;
/** Width of a character relative to the font size, to estimate how far a label reaches. */
const CHAR_EM = 0.58;
const LABEL_SIZE = { room: 7, floor: 8, source: 8 } as const;

/** Rounds to one decimal like the mock, so the markup is short and stable. */
const f1 = (n: number): string => n.toFixed(1);
const pt = (p: Vec3): string => project(p).map(f1).join(",");

/** The corners of a box as the six points of its outline. */
function corners(b: SceneBox): Vec3[] {
  const { x, y, z, w, d, h } = b;
  return [
    [x, y, z + h],
    [x + w, y, z + h],
    [x + w, y + d, z + h],
    [x, y + d, z + h],
    [x, y + d, z],
    [x + w, y + d, z],
    [x + w, y, z],
  ];
}

/** Whether a label is drawn: room labels are dropped on a narrow card. */
export function labelVisible(l: SceneLabel, narrow: boolean): boolean {
  return !(narrow && l.kind === "room");
}

/** The two text lines of a label, in screen units: the point it is anchored to and its estimated extent. */
function labelExtent(l: SceneLabel): { x0: number; x1: number; y0: number; y1: number } {
  const size = LABEL_SIZE[l.kind];
  const [x, y] = project(l.at);
  const w = Math.max(l.name.length, l.value.length) * size * CHAR_EM;
  const x0 = l.anchor === "start" ? x : l.anchor === "end" ? x - w : x - w / 2;
  return { x0, x1: x0 + w, y0: y - 8 - size, y1: y + 2 };
}

/**
 * The viewBox that fits the drawing: boxes, flow lines and the labels that are shown, plus padding. Computed from the
 * scene (the mock measures the DOM), so it works without a browser and does not change when the card is resized,
 * except that the room labels are left out when `narrow`.
 */
export function sceneViewBox(scene: HouseScene, narrow: boolean): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (x: number, y: number): void => {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  };
  for (const b of scene.boxes) for (const c of corners(b)) add(...project(c));
  for (const fl of scene.flows) for (const p of fl.points) add(...project(p));
  for (const l of scene.labels) {
    if (!labelVisible(l, narrow)) continue;
    const e = labelExtent(l);
    add(e.x0, e.y0);
    add(e.x1, e.y1);
  }
  if (!Number.isFinite(x0)) {
    const [x, y] = project([0, 0, 0]);
    return [x - VIEW_PAD, y - VIEW_PAD, 2 * VIEW_PAD, 2 * VIEW_PAD];
  }
  return [x0 - VIEW_PAD, y0 - VIEW_PAD, x1 - x0 + 2 * VIEW_PAD, y1 - y0 + 2 * VIEW_PAD];
}

/** The target a tap on a box selects: a power source, the room with its floor, or the floor; undefined for decoration. */
export function pickTarget(b: SceneBox): HouseSelection | undefined {
  if (b.source) return { source: b.source };
  if (b.kind === "room" || b.kind === "battery") return b.area_id ? { floor_id: b.floor_id, area_id: b.area_id } : undefined;
  if (b.kind === "slab" && b.floor_id) return { floor_id: b.floor_id };
  return undefined;
}

/** A polygon from world points. */
const poly = (pts: Vec3[], cls: string): SVGTemplateResult => svg`<polygon class=${cls} points=${pts.map(pt).join(" ")}></polygon>`;

/** The faces of a box: top, left (front, y + d) and right (x + w), as in the mock. A box of height 0 is only a top face (the ground). */
function faces(b: SceneBox): SVGTemplateResult {
  const { x, y, z, w, d, h } = b;
  if (b.kind === "ground") {
    return poly(
      [
        [x, y, z],
        [x + w, y, z],
        [x + w, y + d, z],
        [x, y + d, z],
      ],
      "ground",
    );
  }
  const cls = b.tone;
  return svg`${poly(
    [
      [x, y, z + h],
      [x + w, y, z + h],
      [x + w, y + d, z + h],
      [x, y + d, z + h],
    ],
    `${cls} t`,
  )}${poly(
    [
      [x, y + d, z],
      [x + w, y + d, z],
      [x + w, y + d, z + h],
      [x, y + d, z + h],
    ],
    `${cls} l`,
  )}${poly(
    [
      [x + w, y, z],
      [x + w, y + d, z],
      [x + w, y + d, z + h],
      [x + w, y, z + h],
    ],
    `${cls} r`,
  )}`;
}

/** One gesture per element, kept with the element so a hold survives re-renders; the options come from the latest render. */
const gestures = new WeakMap<Element, Gesture>();
function gestureOf(el: Element): Gesture {
  let g = gestures.get(el);
  if (!g) gestures.set(el, (g = new Gesture()));
  return g;
}

/** A box that can be picked: focusable, with name and value for screen readers, tap, hold and double tap. */
function pickable(b: SceneBox, target: HouseSelection, ctx: HouseViewContext): SVGTemplateResult {
  const actions = !!ctx.onAction;
  const has = (kind: "hold" | "double") => actions && (ctx.hasAction?.(target, kind) ?? true);
  const run = (el: Element): Gesture => {
    const g = gestureOf(el);
    g.update({
      hold: has("hold"),
      double: has("double"),
      onTap: () => ctx.onSelect(b.selected ? {} : target),
      onHold: () => ctx.onAction?.(target, "hold"),
      onDouble: () => ctx.onAction?.(target, "double"),
    });
    return g;
  };
  const cls = ["pick", b.selected ? "sel" : "", b.dimmed ? "dim" : ""].filter(Boolean).join(" ");
  // the solar panels and the pole arm only extend the picked source: one stop for keyboard and screen reader is enough
  const stop = !(b.source && b.aria === undefined);
  return svg`<g class=${cls} data-key=${b.key} role=${stop ? "button" : nothing} tabindex=${stop ? "0" : nothing} aria-label=${stop ? (b.aria ?? b.key) : nothing} aria-pressed=${stop ? (b.selected ? "true" : "false") : nothing}
    @click=${(e: Event) => run(e.currentTarget as Element).click()}
    @pointerdown=${(e: Event) => run(e.currentTarget as Element).down()}
    @pointerup=${(e: Event) => run(e.currentTarget as Element).up()}
    @pointerleave=${(e: Event) => run(e.currentTarget as Element).up()}
    @pointercancel=${(e: Event) => run(e.currentTarget as Element).up()}
    @contextmenu=${(e: Event) => has("hold") && e.preventDefault()}
    @keydown=${(e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      run(e.currentTarget as Element).click();
    }}>${faces(b)}</g>`;
}

/** A box as drawn: picked parts are interactive groups, the rest plain faces. */
function box(b: SceneBox, ctx: HouseViewContext): SVGTemplateResult {
  const target = pickTarget(b);
  if (target) return pickable(b, target, ctx);
  return b.dimmed ? svg`<g class="dim">${faces(b)}</g>` : faces(b);
}

/** A flow line: a faint wide line below, the (dashed, moving) line on top, and the end node. */
function flow(f: SceneFlow, ctx: HouseViewContext): SVGTemplateResult {
  const pts = f.points.map(pt).join(" ");
  const state = f.active ? "on" : "idle";
  return svg`<g class=${f.dimmed ? "dim" : ""} data-key=${f.key}>
    <polyline class="fl bg" points=${pts} stroke=${f.color} stroke-width=${f.width + FLOW_UNDERLAY}></polyline>
    <polyline class="fl fg ${state}" points=${pts} stroke=${f.color} stroke-width=${f.width}></polyline>
    ${f.node ? svg`<circle class="flow-node" cx=${f1(project(f.node)[0])} cy=${f1(project(f.node)[1])} r=${NODE_RADIUS} fill=${f.color}></circle>` : ""}
  </g>`;
}

/** A two-line label: name normal, value bold; kinds floor and source are 8 units, sources also bold. */
function label(l: SceneLabel): SVGTemplateResult {
  const [x, y] = project(l.at);
  const cls = `lbl${l.kind === "room" ? "" : " big"}${l.kind === "source" ? " src" : ""}${l.dimmed ? " dim" : ""}`;
  return svg`<text class=${cls} text-anchor=${l.anchor} data-key=${l.key}><tspan x=${f1(x)} y=${f1(y - 8)}>${l.name}</tspan><tspan x=${f1(x)} y=${f1(y)} class="kw">${l.value}</tspan></text>`;
}

/**
 * Draws the scene as SVG: boxes in the given order (back to front), then the flow lines, then the labels, as in the
 * mock. Picked floors and rooms are focusable buttons (Tab, Enter or Space) with name and value as aria label.
 * Room labels are left out when `narrow`; the detail list under the graphic carries the values then.
 */
export function renderHouse(scene: HouseScene, ctx: HouseViewContext): TemplateResult {
  const vb = sceneViewBox(scene, ctx.narrow).map(f1).join(" ");
  const interactive = scene.boxes.some((b) => pickTarget(b));
  return svg`<svg class="house ${ctx.animate ? "animate" : ""}" viewBox=${vb} role=${interactive ? "group" : "img"}
    aria-label=${localize(ctx.lang, "house_aria_graphic")} data-cols=${scene.cols} data-rows=${scene.rows}>
    <style>${unsafeSVG(HOUSE_CSS)}</style>
    ${scene.boxes.map((b) => box(b, ctx))}
    ${scene.flows.map((f) => flow(f, ctx))}
    ${scene.labels.filter((l) => labelVisible(l, ctx.narrow)).map(label)}
  </svg>` as TemplateResult;
}
