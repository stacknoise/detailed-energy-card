import { describe, expect, it } from "vitest";
import { AVAILABLE_VIEWS, offeredViews, parseShown } from "../src/view/views";

describe("views", () => {
  it("draws the tree and the timeline so far", () => {
    expect(AVAILABLE_VIEWS).toEqual(["tree", "timeline"]);
  });

  it("offers options.views in their fixed order, else only options.view", () => {
    expect(offeredViews(undefined, undefined)).toEqual(["tree"]);
    expect(offeredViews("timeline", undefined)).toEqual(["timeline"]);
    expect(offeredViews("timeline", ["timeline", "tree"])).toEqual(["tree", "timeline"]);
    // views the card cannot draw yet are left out; nothing left: the tree
    expect(offeredViews(undefined, ["sankey", "tree"])).toEqual(["tree"]);
    expect(offeredViews(undefined, ["pie"])).toEqual(["tree"]);
    expect(offeredViews(undefined, ["sankey"], true, ["tree", "sankey", "timeline"])).toEqual(["sankey"]);
  });

  it("offers no timeline without energy sensors", () => {
    expect(offeredViews("timeline", ["tree", "timeline"], false)).toEqual(["tree"]);
    expect(offeredViews("timeline", undefined, false)).toEqual(["tree"]);
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
