/** The parts of `hass` that change what the editor shows. */
export interface EditorHass {
  states: Record<string, unknown>;
  language?: string;
  locale?: { language?: string };
  areas?: unknown;
  floors?: unknown;
  themes?: unknown;
}

/**
 * Home Assistant hands over a new `hass` object on every state change in the whole instance.
 * The editor only needs to render again when something it displays changed: the language,
 * the theme (contrast hint), the floors / areas, or the state of a sensor used in the config.
 */
export function hassChangedForEditor(old: EditorHass | undefined, next: EditorHass | undefined, entityIds: readonly string[]): boolean {
  if (!old || !next) return true;
  if ((old.locale?.language ?? old.language) !== (next.locale?.language ?? next.language)) return true;
  if (old.areas !== next.areas || old.floors !== next.floors || old.themes !== next.themes) return true;
  return entityIds.some((id) => old.states?.[id] !== next.states?.[id]);
}
