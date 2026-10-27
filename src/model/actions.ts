/** Actions of the Home Assistant standard (`tap_action`, `hold_action`, `double_tap_action`), the ones the card runs itself. */
export const ACTION_TYPES = ["more-info", "toggle", "navigate", "url", "perform-action", "call-service", "none"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export interface ActionConfig {
  action: ActionType;
  /** the entity the action is about; default: the sensor of the element (a consumer with a switch: the switch) */
  entity?: string;
  /** `navigate`: a path of the Home Assistant frontend, starting with "/" */
  navigation_path?: string;
  /** `url`: an address starting with http://, https:// or "/" */
  url_path?: string;
  /** `perform-action`: "domain.service" (`service` is the older name, with `call-service`) */
  perform_action?: string;
  service?: string;
  data?: Record<string, unknown>;
  target?: Record<string, unknown>;
  /** ask before running: `true` or an own text */
  confirmation?: boolean | { text?: string };
}

/** The three actions of an element and the entity they are about. */
export interface NodeActions {
  tap?: ActionConfig;
  hold?: ActionConfig;
  double?: ActionConfig;
  /** what `more-info` and `toggle` act on when the action names no entity */
  entity?: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** "light.turn_on" → ["light", "turn_on"]; undefined for anything else. */
export function splitService(s: unknown): [string, string] | undefined {
  if (typeof s !== "string") return undefined;
  const m = /^([a-z0-9_]+)\.([a-z0-9_]+)$/.exec(s);
  return m ? [m[1], m[2]] : undefined;
}

/** Only http(s) and paths of the frontend are opened: never `javascript:` or the like. */
export function safeUrl(u: unknown): string | undefined {
  if (typeof u !== "string" || !u) return undefined;
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  return /^https?:\/\//i.test(u) ? u : undefined;
}

/** Message for a faulty action, undefined when it is fine (or not set). `where` names the field. */
export function actionError(a: unknown, where: string): string | undefined {
  if (a === undefined || a === null) return undefined;
  if (!isObj(a)) return `${where} must be a mapping with an action`;
  if (!(ACTION_TYPES as readonly unknown[]).includes(a.action)) return `${where}.action: "${String(a.action)}" must be one of ${ACTION_TYPES.join(", ")}`;
  if (a.entity !== undefined && (typeof a.entity !== "string" || !/^[a-z0-9_]+\.[\w]+$/.test(a.entity))) return `${where}.entity must be an entity id`;
  if (a.action === "navigate" && !(typeof a.navigation_path === "string" && a.navigation_path.startsWith("/"))) {
    return `${where}.navigation_path must be a path starting with "/"`;
  }
  if (a.action === "url" && !safeUrl(a.url_path)) return `${where}.url_path must be an address starting with http://, https:// or "/"`;
  if (a.action === "perform-action" && !splitService(a.perform_action ?? a.service)) return `${where}.perform_action must be like "light.turn_on"`;
  if (a.action === "call-service" && !splitService(a.service ?? a.perform_action)) return `${where}.service must be like "light.turn_on"`;
  for (const key of ["data", "target"] as const) if (a[key] !== undefined && !isObj(a[key])) return `${where}.${key} must be a mapping`;
  const c = a.confirmation;
  if (c !== undefined && typeof c !== "boolean" && !(isObj(c) && (c.text === undefined || typeof c.text === "string"))) {
    return `${where}.confirmation must be true, false or a mapping with a text`;
  }
  return undefined;
}

/** The actions an element's configuration names; undefined when it names none. */
export function actionsOf(c: { tap_action?: ActionConfig; hold_action?: ActionConfig; double_tap_action?: ActionConfig }, entity?: string): NodeActions | undefined {
  if (!c.tap_action && !c.hold_action && !c.double_tap_action) return undefined;
  return { tap: c.tap_action, hold: c.hold_action, double: c.double_tap_action, entity };
}

/** What running an action needs from the card and the browser. */
export interface ActionDeps {
  callService(domain: string, service: string, data?: Record<string, unknown>, target?: Record<string, unknown>): unknown;
  moreInfo(entityId: string): void;
  navigate(path: string): void;
  open(url: string): void;
  confirm(text: string): boolean;
  /** text of the question when the action names none */
  confirmText: string;
}

/** Runs one action like the built-in cards do. Returns whether something ran (false: nothing to do, or the user said no). */
export async function runAction(a: ActionConfig | undefined, entity: string | undefined, deps: ActionDeps): Promise<boolean> {
  if (!a || a.action === "none") return false;
  if (a.confirmation) {
    const text = typeof a.confirmation === "object" && a.confirmation.text ? a.confirmation.text : deps.confirmText;
    if (!deps.confirm(text)) return false;
  }
  const target = a.entity ?? entity;
  switch (a.action) {
    case "more-info":
      if (!target) return false;
      deps.moreInfo(target);
      return true;
    case "toggle":
      if (!target) return false;
      await deps.callService("homeassistant", "toggle", { entity_id: target });
      return true;
    case "navigate":
      if (!a.navigation_path?.startsWith("/")) return false;
      deps.navigate(a.navigation_path);
      return true;
    case "url": {
      const url = safeUrl(a.url_path);
      if (!url) return false;
      deps.open(url);
      return true;
    }
    case "perform-action":
    case "call-service": {
      const parts = splitService(a.action === "perform-action" ? (a.perform_action ?? a.service) : (a.service ?? a.perform_action));
      if (!parts) return false;
      await deps.callService(parts[0], parts[1], a.data, a.target);
      return true;
    }
    default:
      return false;
  }
}
