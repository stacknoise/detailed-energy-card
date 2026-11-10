import { expect, test, type Page } from "@playwright/test";

/*
 * Comparison of the 3D graphic with the mock (docs/mockups/3d/house-view-mock.html, variant A), concept section 1a.
 * The mock draws its rooms free in 150 x 70 units; the card places them on the 12 x 6 grid of 150 x 75 units and the
 * rooms fill the floor slab. A pixel comparison would therefore only measure that decision, so what is compared is
 * what the mock fixes: the parts and their number, flow colours and widths, node radius, the texts and the anchors
 * of the labels. The pixel level is checked by the screenshots of the README (`npm run screenshots`).
 */

interface Facts {
  solar: number;
  ground: number;
  flows: number;
  nodes: number;
  nodeRadius: string[];
  flowWidths: string[];
  labels: Array<{ anchor: string | null; name: string; value: string; big: boolean }>;
}

const MOCK_FLOW_WIDTHS = ["2", "5"];

/** What the mock's variant A and the card's graphic have in common, read from the SVG. */
const facts = (page: Page, sel: string, mock: boolean): Promise<Facts> =>
  page.evaluate(
    ({ sel, mock }) => {
      const svg = document.querySelector(sel) as SVGSVGElement;
      const q = (s: string) => [...svg.querySelectorAll(s)];
      const labels = q("text.lbl").map((t) => {
        const spans = t.querySelectorAll("tspan");
        return { anchor: t.getAttribute("text-anchor"), name: spans[0].textContent ?? "", value: spans[1].textContent ?? "", big: t.classList.contains("big") };
      });
      const cs = (e: Element, p: string) => getComputedStyle(e).getPropertyValue(p);
      return {
        solar: q("polygon.solar.t").length,
        ground: q("polygon.ground").length,
        flows: q("polyline.fl.fg").length,
        nodes: q("circle").length,
        nodeRadius: [...new Set(q("circle").map((c) => c.getAttribute("r") ?? ""))],
        flowWidths: [...new Set(q("polyline.fl").map((l) => (mock ? cs(l, "stroke-width").replace("px", "") : (l.getAttribute("stroke-width") ?? ""))))].sort(),
        labels,
      };
    },
    { sel, mock },
  );

test("graphic and mock A show the same parts, flows and labels", async ({ page }) => {
  // the mock file has no charset declaration: decode it as UTF-8 ourselves
  await page.setContent(await (await page.request.get("/docs/mockups/3d/house-view-mock.html")).text());
  const mock = await facts(page, "#svgA", true);
  await page.goto("/dev/house-view.html?w=700");
  await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready);
  const ours = await facts(page, "svg.house", false);

  expect(ours.solar).toBe(mock.solar);
  expect(ours.ground).toBe(mock.ground);
  expect(ours.flows).toBe(mock.flows);
  expect(ours.nodes).toBe(mock.nodes);
  expect(ours.nodeRadius).toEqual(mock.nodeRadius);
  expect(MOCK_FLOW_WIDTHS).toEqual(expect.arrayContaining(ours.flowWidths));
  // the labels: same count, same anchors, same big (floor and source) labels, same names (the card writes the values with formatPower)
  expect(ours.labels).toHaveLength(mock.labels.length);
  const key = (l: Facts["labels"][number]) => `${l.anchor}|${l.big}|${l.name}`;
  expect(ours.labels.map(key).sort()).toEqual(mock.labels.map(key).sort());
});
