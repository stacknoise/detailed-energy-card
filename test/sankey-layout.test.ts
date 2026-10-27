import { describe, expect, it } from "vitest";
import { bandPath, layoutSankey, type SankeyInput } from "../src/view/sankey-layout";

const base = (over: Partial<SankeyInput>): SankeyInput => ({ nodes: [], links: [], width: 400, height: 200, ...over });
const byId = <T extends { id: string }>(list: T[], id: string) => list.find((x) => x.id === id)!;

const SIMPLE = base({
  nodes: [
    { id: "pv", col: 0, value: 3 },
    { id: "grid", col: 0, value: 1 },
    { id: "eg", col: 1, value: 3 },
    { id: "og", col: 1, value: 1 },
  ],
  links: [
    { id: "pv>eg", from: "pv", to: "eg", value: 2.25 },
    { id: "pv>og", from: "pv", to: "og", value: 0.75 },
    { id: "grid>eg", from: "grid", to: "eg", value: 0.75 },
    { id: "grid>og", from: "grid", to: "og", value: 0.25 },
  ],
});

describe("sankey layout", () => {
  it("uses one scale for all columns, so bands keep their width", () => {
    const l = layoutSankey(SIMPLE);
    const pv = byId(l.nodes, "pv");
    const eg = byId(l.nodes, "eg");
    // both columns carry 4 units: node heights are proportional to their values
    expect(pv.h / eg.h).toBeCloseTo(1, 5);
    expect(byId(l.nodes, "grid").h).toBeCloseTo(pv.h / 3, 5);
    // a band is as thick as its value says and the bands of a node add up to the node
    const out = l.links.filter((b) => b.from === "pv").reduce((s, b) => s + b.h, 0);
    expect(out).toBeCloseTo(pv.h, 5);
  });

  it("stacks the nodes of a column in the given order without overlap and within the height", () => {
    const l = layoutSankey(SIMPLE);
    const col0 = l.nodes.filter((n) => n.col === 0);
    expect(col0[0].y + col0[0].h).toBeLessThan(col0[1].y);
    for (const n of l.nodes) {
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y + n.h).toBeLessThanOrEqual(l.height + 1e-9);
    }
    expect(l.height).toBeLessThanOrEqual(200 + 1e-9);
  });

  it("puts the columns from the left edge to the last column, leaving room for its labels", () => {
    const l = layoutSankey({ ...SIMPLE, reserve: 100 });
    expect(byId(l.nodes, "pv").x).toBe(0);
    expect(byId(l.nodes, "eg").x).toBeCloseTo(400 - 100 - l.nodeWidth, 5);
  });

  it("lets a band leave and enter a node in the order of the nodes it connects", () => {
    const l = layoutSankey(SIMPLE);
    // from pv the band to eg (the upper node) goes first
    expect(byId(l.links, "pv>eg").y0).toBeLessThan(byId(l.links, "pv>og").y0);
    // into eg the band from pv (the upper source) comes first
    expect(byId(l.links, "pv>eg").y1).toBeLessThan(byId(l.links, "grid>eg").y1);
  });

  it("never draws a node thinner than the minimum and keeps tiny nodes apart", () => {
    const l = layoutSankey(
      base({
        nodes: [
          { id: "a", col: 0, value: 1000 },
          { id: "b", col: 0, value: 0.001 },
          { id: "c", col: 1, value: 1000.001 },
        ],
        links: [
          { id: "a>c", from: "a", to: "c", value: 1000 },
          { id: "b>c", from: "b", to: "c", value: 0.001 },
        ],
        minHeight: 3,
      }),
    );
    const b = byId(l.nodes, "b");
    expect(b.h).toBe(3);
    expect(byId(l.nodes, "a").y + byId(l.nodes, "a").h).toBeLessThan(b.y);
  });

  it("sizes a node by the larger of its value and its bands", () => {
    const l = layoutSankey(
      base({
        nodes: [
          { id: "a", col: 0, value: 1 },
          { id: "b", col: 1, value: 1 },
        ],
        links: [{ id: "a>b", from: "a", to: "b", value: 3 }],
      }),
    );
    expect(byId(l.nodes, "a").total).toBe(3);
    expect(byId(l.nodes, "b").h).toBeCloseTo(byId(l.nodes, "a").h, 5);
  });

  it("leaves a larger gap above the first tail node of a column", () => {
    const nodes = [
      { id: "a", col: 0, value: 1 },
      { id: "x", col: 1, value: 1 },
      { id: "y", col: 1, value: 1 },
      { id: "t1", col: 1, value: 1, tail: true },
      { id: "t2", col: 1, value: 1, tail: true },
    ];
    const l = layoutSankey(base({ nodes, links: [] }));
    const gap = (u: string, v: string) => byId(l.nodes, v).y - (byId(l.nodes, u).y + byId(l.nodes, u).h);
    expect(gap("y", "t1")).toBeGreaterThan(gap("x", "y"));
    expect(gap("t1", "t2")).toBeCloseTo(gap("x", "y"), 5);
  });

  it("ignores bands without value or to unknown nodes, and copes with nothing to draw", () => {
    const l = layoutSankey(
      base({
        nodes: [
          { id: "a", col: 0, value: 1 },
          { id: "b", col: 1, value: 1 },
        ],
        links: [
          { id: "a>b", from: "a", to: "b", value: 0 },
          { id: "a>z", from: "a", to: "z", value: 1 },
        ],
      }),
    );
    expect(l.links).toEqual([]);
    expect(layoutSankey(base({}))).toMatchObject({ nodes: [], links: [], height: 0, columns: 0 });
    const zero = layoutSankey(base({ nodes: [{ id: "a", col: 0, value: 0 }] }));
    expect(zero.nodes[0].h).toBeGreaterThan(0);
  });

  it("draws a band as a curve along its center line", () => {
    expect(bandPath({ x0: 10, x1: 110, y0: 0, y1: 40, h: 10 })).toBe("M10,5C60,5 60,45 110,45");
  });
});
