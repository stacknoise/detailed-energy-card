import type { AreaEntry, FloorEntry } from "../../model/registry";

/** The parts of Home Assistant's `hass` object the wizard reads. */
export interface ImportHass {
  states: Record<string, { attributes?: { device_class?: unknown; unit_of_measurement?: unknown; friendly_name?: unknown } } | undefined>;
  entities?: Record<string, { device_id?: string | null; area_id?: string | null } | undefined>;
  devices?: Record<string, { area_id?: string | null } | undefined>;
  areas?: Record<string, AreaEntry | undefined>;
  floors?: Record<string, FloorEntry | undefined>;
}

export interface CollectedSource {
  type: "grid" | "solar" | "battery";
  name?: string;
  /** counter of what the source delivers (grid import, solar production, battery discharge) */
  energy?: string;
  /** counter of the other direction (grid feed-in, battery charge) */
  energyReturn?: string;
  /** power sensor of the dashboard (`stat_rate`) or the only one at the same device; undefined: the user has to choose */
  power?: string;
  /** power sensors that could be it (more than one at the device) */
  powerChoices: string[];
  soc?: string;
  /** every counter the source needs is an entity of this Home Assistant (not an external statistic) */
  usable: boolean;
}

export interface CollectedDevice {
  /** the counter (`stat_consumption`) */
  stat: string;
  name: string;
  power?: string;
  powerChoices: string[];
  /** `included_in_stat`: the counter of the device this one is part of */
  includedIn?: string;
  areaId?: string;
  usable: boolean;
}

export interface Collected {
  sources: CollectedSource[];
  devices: CollectedDevice[];
  /** the Energy dashboard has nothing set up yet */
  empty: boolean;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

/** All power sensors of the installation, for the choice of the power sensor of a source. */
export function powerSensors(hass: ImportHass): string[] {
  return Object.entries(hass.states)
    .filter(([id, s]) => id.startsWith("sensor.") && s?.attributes?.device_class === "power")
    .map(([id]) => id)
    .sort();
}

/** Power sensors at the same device as an entity (the entity itself excluded). */
function devicePower(hass: ImportHass, entityId: string): string[] {
  const device = hass.entities?.[entityId]?.device_id;
  if (!device) return [];
  return Object.entries(hass.entities ?? {})
    .filter(([id, e]) => id !== entityId && e?.device_id === device && id.startsWith("sensor.") && hass.states[id]?.attributes?.device_class === "power")
    .map(([id]) => id)
    .sort();
}

/** The area of an entity: its own, else the one of its device. */
export function areaOf(hass: ImportHass, entityId: string): string | undefined {
  const e = hass.entities?.[entityId];
  const own = e?.area_id;
  if (own) return own;
  const device = e?.device_id ? hass.devices?.[e.device_id]?.area_id : undefined;
  return device || undefined;
}

const isEntity = (hass: ImportHass, id: string | undefined): boolean => !!id && !!hass.states[id];

function pickPower(hass: ImportHass, counter: string | undefined, rate: string | undefined): { power?: string; choices: string[] } {
  if (rate && isEntity(hass, rate)) return { power: rate, choices: [] };
  const found = counter ? devicePower(hass, counter) : [];
  return found.length === 1 ? { power: found[0], choices: [] } : { choices: found };
}

/**
 * Reads the answer of `energy/get_prefs` defensively: unknown fields are ignored, missing ones tolerated, the old
 * form of the grid (`flow_from` / `flow_to` lists) is understood as well as the new one (both counters in one entry).
 * Gas and water are not electricity and are left out.
 */
export function collectPrefs(prefs: unknown, hass: ImportHass): Collected {
  const sources: CollectedSource[] = [];
  const devices: CollectedDevice[] = [];
  const p = isObj(prefs) ? prefs : {};

  for (const raw of Array.isArray(p.energy_sources) ? p.energy_sources : []) {
    if (!isObj(raw)) continue;
    const type = raw.type;
    if (type === "grid") {
      const from = Array.isArray(raw.flow_from) ? raw.flow_from.filter(isObj) : [];
      const to = Array.isArray(raw.flow_to) ? raw.flow_to.filter(isObj) : [];
      const legacy = from.length || to.length;
      const energy = legacy ? str(from[0]?.stat_energy_from) : str(raw.stat_energy_from);
      const energyReturn = legacy ? str(to[0]?.stat_energy_to) : str(raw.stat_energy_to);
      if (!energy && !energyReturn) continue;
      const { power, choices } = pickPower(hass, energy ?? energyReturn, str(raw.stat_rate));
      sources.push({
        type: "grid",
        name: str(raw.name),
        energy,
        energyReturn,
        power,
        powerChoices: choices,
        usable: !!energy && isEntity(hass, energy) && (!energyReturn || isEntity(hass, energyReturn)),
      });
    } else if (type === "solar") {
      const energy = str(raw.stat_energy_from);
      if (!energy) continue;
      const { power, choices } = pickPower(hass, energy, str(raw.stat_rate));
      sources.push({ type: "solar", name: str(raw.name), energy, power, powerChoices: choices, usable: isEntity(hass, energy) });
    } else if (type === "battery") {
      const energy = str(raw.stat_energy_from);
      const energyReturn = str(raw.stat_energy_to);
      if (!energy && !energyReturn) continue;
      const { power, choices } = pickPower(hass, energy ?? energyReturn, str(raw.stat_rate));
      const soc = str(raw.stat_soc);
      sources.push({
        type: "battery",
        name: str(raw.name),
        energy,
        energyReturn,
        power,
        powerChoices: choices,
        soc: soc && isEntity(hass, soc) ? soc : undefined,
        usable: !!energy && isEntity(hass, energy) && (!energyReturn || isEntity(hass, energyReturn)),
      });
    }
  }

  for (const raw of Array.isArray(p.device_consumption) ? p.device_consumption : []) {
    if (!isObj(raw)) continue;
    const stat = str(raw.stat_consumption);
    if (!stat) continue;
    const { power, choices } = pickPower(hass, stat, str(raw.stat_rate));
    const friendly = hass.states[stat]?.attributes?.friendly_name;
    devices.push({
      stat,
      name: str(raw.name) ?? (typeof friendly === "string" && friendly ? friendly : stat),
      power,
      powerChoices: choices,
      includedIn: str(raw.included_in_stat),
      areaId: areaOf(hass, stat),
      usable: isEntity(hass, stat),
    });
  }
  return { sources, devices, empty: sources.length === 0 && devices.length === 0 };
}
