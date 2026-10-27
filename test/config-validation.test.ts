import { describe, expect, it } from "vitest";
import { ConfigError, collectEntityIds, validateConfig } from "../src/model/config";
import { formatPower } from "../src/model/units";

const base = { type: "custom:detailed-energy-card" };
const rejects = (cfg: Record<string, unknown>, message: RegExp) => {
  expect(() => validateConfig({ ...base, ...cfg })).toThrow(ConfigError);
  expect(() => validateConfig({ ...base, ...cfg })).toThrow(message);
};

describe("validateConfig: types (U-5)", () => {
  it("names the field when a list is not a list", () => {
    rejects({ sources: {} }, /^sources must be a list/);
    rejects({ rooms: "kitchen" }, /^rooms must be a list/);
    rejects({ floors: [{ floor_id: "eg", rooms: "x" }] }, /floors\[0\]\.rooms must be a list/);
    rejects({ rooms: [{ area_id: "a", consumers: {} }] }, /rooms\[0\]\.consumers must be a list/);
    rejects({ colors: { thresholds: { from: 0 } } }, /colors\.thresholds must be a list/);
  });
  it("rejects entries that are not mappings", () => {
    rejects({ sources: ["sensor.grid"] }, /sources\[0\] must be a mapping/);
    rejects({ home: "sensor.total" }, /home must be a mapping/);
    rejects({ options: true }, /options must be a mapping/);
    rejects({ colors: "red" }, /colors must be a mapping/);
  });
  it("accepts absent and null sections", () => {
    expect(() => validateConfig({ ...base, home: null, options: null, colors: null, rooms: null })).not.toThrow();
  });
});

describe("validateConfig: options (U-1)", () => {
  it.each(["", 5, "x".repeat(65)])("rejects storage_id %j", (storage_id) => {
    rejects({ options: { storage_id } }, /options\.storage_id/);
  });
  it("accepts a storage_id", () => {
    expect(() => validateConfig({ ...base, options: { storage_id: "energy-view" } })).not.toThrow();
  });
  it.each([-1, -3, 21, 1.5, "2", Number.NaN])("rejects decimals %s", (decimals) => {
    rejects({ options: { decimals } }, /options\.decimals/);
  });
  it.each([0, 2, 4, 20])("accepts decimals %s", (decimals) => {
    expect(() => validateConfig({ ...base, options: { decimals } })).not.toThrow();
  });
  it("checks unit and switches", () => {
    rejects({ options: { unit: "MW" } }, /options\.unit/);
    rejects({ options: { animation: "no" } }, /options\.animation must be true or false/);
    rejects({ sources: [{ entity: "sensor.pv", invert: 1 }] }, /sources\[0\]\.invert/);
    expect(() => validateConfig({ ...base, options: { unit: "kW", animation: false, wrap_rooms: true } })).not.toThrow();
  });
});

describe("validateConfig: actions and switches", () => {
  const room = (consumer: Record<string, unknown>) => ({ rooms: [{ area_id: "a", consumers: [{ entity: "sensor.x", ...consumer }] }] });

  it("accepts the three actions on a source, a floor, a room and a consumer", () => {
    const act = { tap_action: { action: "more-info" }, hold_action: { action: "toggle" }, double_tap_action: { action: "none" } };
    const cfg = {
      ...base,
      sources: [{ entity: "sensor.pv", ...act }],
      floors: [{ floor_id: "eg", ...act, rooms: [{ area_id: "k", ...act, consumers: [{ entity: "sensor.x", ...act }] }] }],
    };
    expect(() => validateConfig(cfg)).not.toThrow();
  });

  it("names the element and the field of a faulty action", () => {
    rejects({ sources: [{ entity: "sensor.pv", hold_action: { action: "explode" } }] }, /^sources\[0\]\.hold_action\.action: "explode"/);
    rejects({ floors: [{ floor_id: "eg", tap_action: { action: "navigate" } }] }, /^floors\[0\]\.tap_action\.navigation_path/);
    rejects({ floors: [{ floor_id: "eg", rooms: [{ area_id: "a", double_tap_action: "toggle" }] }] }, /^floors\[0\]\.rooms\[0\]\.double_tap_action must be a mapping/);
    rejects(room({ tap_action: { action: "url", url_path: "javascript:alert(1)" } }), /rooms\[0\]\.consumers\[0\]\.tap_action\.url_path/);
  });

  it("accepts a switch of the allowed domains and a confirmation, and refuses anything else", () => {
    for (const id of ["switch.heizung", "input_boolean.x", "light.a", "fan.b"]) expect(() => validateConfig({ ...base, ...room({ switch_entity: id, confirm_switch: true }) })).not.toThrow();
    rejects(room({ switch_entity: "sensor.power" }), /rooms\[0\]\.consumers\[0\]\.switch_entity: "sensor\.power" is not a switch/);
    rejects(room({ switch_entity: "switch.a", confirm_switch: "yes" }), /confirm_switch must be true or false/);
  });

  it("watches the switch as an entity of the card, so that its state renders the card", () => {
    const cfg = validateConfig({ ...base, ...room({ switch_entity: "switch.heizung" }) });
    expect(collectEntityIds(cfg)).toContain("switch.heizung");
  });
});

describe("validateConfig: base load and standby", () => {
  it.each([0, -5, "5", Number.NaN, Number.POSITIVE_INFINITY])("rejects standby_watts %s", (standby_watts) => {
    rejects({ options: { standby_watts } }, /options\.standby_watts/);
  });
  it.each([1, 5, 7.5])("accepts standby_watts %s", (standby_watts) => {
    expect(() => validateConfig({ ...base, options: { standby_watts } })).not.toThrow();
  });
  it("wants show_base_load to be true or false", () => {
    rejects({ options: { show_base_load: "yes" } }, /options\.show_base_load/);
    expect(() => validateConfig({ ...base, options: { show_base_load: true } })).not.toThrow();
  });
});

describe("formatPower never throws on bad decimals", () => {
  it.each([-3, 25, 101, Number.NaN, 1.7])("decimals %s", (d) => {
    expect(() => formatPower(1234, "kW", d)).not.toThrow();
  });
  it("clamps into range", () => {
    expect(formatPower(1234, "kW", -3, "en")).toBe("1 kW");
    expect(formatPower(1234, "kW", 1.7, "en")).toBe("1.2 kW");
  });
});

describe("validateConfig: colors (S-1)", () => {
  const attack = "red;background:url(//example.com/x)";
  it("rejects CSS that is more than a color, wherever a color is set", () => {
    rejects({ colors: { accent: attack } }, /colors\.accent/);
    rejects({ colors: { background: "url(//example.com/x)" } }, /colors\.background/);
    rejects({ colors: { thresholds: [{ from: 0, color: attack }] } }, /colors\.thresholds\[0\]\.color/);
    rejects({ sources: [{ entity: "sensor.pv", color: attack }] }, /sources\[0\]\.color/);
    rejects({ floors: [{ floor_id: "eg", color: attack }] }, /floors\[0\]\.color/);
    rejects({ rooms: [{ area_id: "a", color: attack }] }, /rooms\[0\]\.color/);
    rejects({ floors: [{ floor_id: "eg", rooms: [{ area_id: "a", color: attack }] }] }, /floors\[0\]\.rooms\[0\]\.color/);
  });
  it("keeps existing color styles working", () => {
    expect(() =>
      validateConfig({
        ...base,
        colors: { preset: "custom", accent: "#9184d9", flow: "var(--primary-color)", bar: "orange", text: "rgb(233, 233, 237)" },
        sources: [{ entity: "sensor.pv", color: "gold" }],
      }),
    ).not.toThrow();
  });
  it("rejects unknown presets", () => {
    rejects({ colors: { preset: "neon" } }, /colors\.preset/);
  });
});
