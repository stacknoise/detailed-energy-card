import { html, nothing, svg, type TemplateResult } from "lit";

/** One stacked series: an element of the level below the selection (floor, room or consumer). */
export interface TimelineStack {
  id: string;
  name: string;
  color?: string;
  values: number[];
  /** selects the element (a floor or a room); consumers open their more-info dialog */
  pick?: () => void;
}

/** A number of the head: the value and what it means. */
export interface TimelineKpi {
  value: string;
  label: string;
  /** more than the previous period ("up") or less ("down") */
  tone?: "up" | "down";
}

/** What the timeline needs for one frame; built by the card. */
export interface TimelineContext {
  width: number;
  stacks: TimelineStack[];
  /** the shown element in the previous period, per bar (same index), drawn dashed */
  previous?: number[];
  previousLabel: string;
  kpis: TimelineKpi[];
  /** text on the x axis under a bar, or undefined for none */
  axisLabel(i: number): string | undefined;
  /** tooltip of one part of a bar */
  barTitle(i: number, stack: TimelineStack, value: number): string;
  /** a number of the y axis (watt hours) */
  axisValue(wh: number): string;
  /** index of the running bar (marked "now"), -1 when the period is over */
  nowIndex: number;
  nowLabel: string;
  /** shown instead of the chart while the first answer is on its way */
  loading?: string;
}

const H = 170;
const TOP = 10;
const BOTTOM = 20;
const LEFT = 34;
const RIGHT = 6;

/** Color of the i-th stack without an own color: shades of the accent color, lighter and darker by turns. */
export const stackColor = (i: number): string => {
  if (i === 0) return "var(--_accent)";
  const step = Math.ceil(i / 2);
  const mix = Math.max(20, 100 - step * 28);
  return `color-mix(in srgb, var(--_accent) ${mix}%, ${i % 2 ? "white" : "black"})`;
};

/** A round upper end of the y axis: 1, 2 or 5 times a power of ten, at least the largest bar. */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** The timeline: stacked bars per hour or day, the previous period dashed, numbers above, a legend below. */
export function renderTimeline(c: TimelineContext): TemplateResult {
  const n = c.stacks[0]?.values.length ?? c.previous?.length ?? 0;
  const W = Math.max(280, c.width);
  const totals = Array.from({ length: n }, (_, i) => c.stacks.reduce((s, st) => s + (st.values[i] ?? 0), 0));
  const max = niceMax(Math.max(0, ...totals, ...(c.previous ?? [])));
  const bw = n ? (W - LEFT - RIGHT) / n : 0;
  const y = (v: number) => H - BOTTOM - (v / max) * (H - BOTTOM - TOP);
  const parts: TemplateResult[] = [];
  for (const g of [0, max / 2, max]) {
    parts.push(svg`<line class="grid" x1=${LEFT} x2=${W - RIGHT} y1=${y(g)} y2=${y(g)}></line>
      <text class="axis" x=${LEFT - 5} y=${y(g) + 3.5} text-anchor="end">${c.axisValue(g)}</text>`);
  }
  const gap = Math.min(3, bw * 0.2);
  for (let i = 0; i < n; i++) {
    const x = LEFT + i * bw + gap / 2;
    const w = Math.max(1, bw - gap);
    const prev = c.previous?.[i];
    if (prev !== undefined && prev > 0) parts.push(svg`<rect class="prev" x=${x} y=${y(prev)} width=${w} height=${y(0) - y(prev)}></rect>`);
    let acc = 0;
    c.stacks.forEach((st, k) => {
      const v = st.values[i] ?? 0;
      if (v <= 0) return;
      parts.push(svg`<rect class="part" x=${x} y=${y(acc + v)} width=${w} height=${y(acc) - y(acc + v)} style=${`fill:${st.color ?? stackColor(k)}`}><title>${c.barTitle(i, st, v)}</title></rect>`);
      acc += v;
    });
    const label = c.axisLabel(i);
    if (label) parts.push(svg`<text class="axis" x=${LEFT + i * bw} y=${H - 5}>${label}</text>`);
  }
  if (c.nowIndex >= 0 && c.nowIndex < n) {
    const x = LEFT + (c.nowIndex + 1) * bw;
    parts.push(svg`<line class="now" x1=${x} x2=${x} y1=${TOP} y2=${H - BOTTOM}></line><text class="now-label" x=${x + 4} y=${TOP + 9}>${c.nowLabel}</text>`);
  }
  return html`
    <div class="scroll timeline">
      <div class="kpis">
        ${c.kpis.map((k) => html`<div class="kpi"><b class=${k.tone ?? ""}>${k.value}</b><span>${k.label}</span></div>`)}
      </div>
      ${c.loading
        ? html`<div class="timeline-loading">${c.loading}</div>`
        : html`<svg class="chart" width=${W} height=${H} viewBox="0 0 ${W} ${H}" role="img">${parts}</svg>`}
      <div class="legend">
        ${c.stacks.map(
          (st, k) => html`<button class="legend-item" ?disabled=${!st.pick} @click=${() => st.pick?.()}>
            <i style=${`background:${st.color ?? stackColor(k)}`}></i>${st.name}
          </button>`,
        )}
        ${c.previous ? html`<span class="legend-item prev-key"><i></i>${c.previousLabel}</span>` : nothing}
      </div>
    </div>
  `;
}
