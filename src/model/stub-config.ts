import { localize } from "../localize";

/** The parts of Home Assistant's `hass` object used to suggest a starting configuration. */
export interface StubHass {
  language?: string;
  locale?: { language?: string };
  states: Record<string, { attributes?: { device_class?: unknown } } | undefined>;
  areas?: Record<string, { area_id: string; floor_id?: string | null } | undefined>;
  floors?: Record<string, { floor_id: string; level?: number | null } | undefined>;
}

/**
 * Starting configuration for the card picker and "add card": a grid source and consumers
 * taken from the power sensors, and a room (on its floor, if the area has one) from the
 * areas that already exist in Home Assistant, so the preview shows a complete card.
 */
export function buildStubConfig(hass?: StubHass): Record<string, unknown> {
  const power = Object.entries(hass?.states ?? {})
    .filter(([id, s]) => id.startsWith("sensor.") && s?.attributes?.device_class === "power")
    .map(([id]) => id);

  const consumers = power.slice(1, 3).map((entity) => ({ entity }));
  const areas = Object.values(hass?.areas ?? {})
    .filter((a): a is NonNullable<typeof a> => !!a)
    .sort((a, b) => a.area_id.localeCompare(b.area_id));
  const floors = Object.values(hass?.floors ?? {})
    .filter((f): f is NonNullable<typeof f> => !!f)
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.floor_id.localeCompare(b.floor_id));

  const config: Record<string, unknown> = {
    title: localize(hass?.locale?.language ?? hass?.language, "default_title"),
    sources: power.slice(0, 1).map((entity) => ({ entity, type: "grid" })), // named by the card, in the user's language
  };

  // Prefer the first floor that has an area, otherwise the first area without a floor.
  const floor = floors.find((f) => areas.some((a) => a.floor_id === f.floor_id));
  if (floor) {
    const area = areas.find((a) => a.floor_id === floor.floor_id)!;
    config.floors = [{ floor_id: floor.floor_id, rooms: [{ area_id: area.area_id, consumers }] }];
  } else if (areas.length) {
    config.rooms = [{ area_id: areas[0].area_id, consumers }];
  }
  return config;
}
