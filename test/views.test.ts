import { describe, expect, it } from "vitest";
import { AVAILABLE_VIEWS, offeredViews, parseShown } from "../src/view/views";

describe("views", () => {
  it("offers only the tree for now, so the card shows no view switch", () => {
    expect(AVAILABLE_VIEWS).toEqual(["tree"]);
    expect(offeredViews(undefined)).toEqual(["tree"]);
    expect(offeredViews(["tree", "sankey", "timeline"])).toEqual(["tree"]);
  });

  it("offers the wanted views the card can draw, in their fixed order", () => {
    const all = ["tree", "sankey", "timeline"] as const;
    expect(offeredViews(["timeline", "tree"], all)).toEqual(["tree", "timeline"]);
    expect(offeredViews(["sankey"], all)).toEqual(["sankey"]);
    // nothing wanted: the tree alone; nothing left: the tree as a fallback
    expect(offeredViews(undefined, all)).toEqual(["tree"]);
    expect(offeredViews([], all)).toEqual(["tree"]);
    expect(offeredViews(["pie"], all)).toEqual(["tree"]);
  });

  it("reads the remembered mode, period and view, as far as they are still offered", () => {
    const raw = JSON.stringify({ mode: "energy", period: "week", view: "timeline" });
    expect(parseShown(raw, ["today", "week"], ["tree", "timeline"])).toEqual({ mode: "energy", period: "week", view: "timeline" });
    expect(parseShown(raw, ["today"], ["tree"])).toEqual({ mode: "energy" });
    // what 1.1.2 stored, without a view
    expect(parseShown(JSON.stringify({ mode: "power", period: "today" }), ["today"], ["tree"])).toEqual({ mode: "power", period: "today" });
  });

  it("ignores nothing stored, broken text and unknown values", () => {
    expect(parseShown(null, ["today"], ["tree"])).toEqual({});
    expect(parseShown("{broken", ["today"], ["tree"])).toEqual({});
    expect(parseShown("42", ["today"], ["tree"])).toEqual({});
    expect(parseShown(JSON.stringify({ mode: "flow", view: "pie" }), ["today"], ["tree"])).toEqual({});
  });
});
