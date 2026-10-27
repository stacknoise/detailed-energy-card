/** Registration that survives the script being loaded twice (for example as two Lovelace resources). */
export interface ElementRegistry {
  get(name: string): unknown;
  define(name: string, ctor: CustomElementConstructor): void;
}

export function defineOnce(name: string, ctor: CustomElementConstructor, registry: ElementRegistry = customElements): void {
  if (!registry.get(name)) registry.define(name, ctor);
}

/** Adds the card to the picker list unless an entry with the same type is already there. */
export function registerCardOnce(list: Array<Record<string, unknown>>, entry: { type: string } & Record<string, unknown>): void {
  if (!list.some((c) => c.type === entry.type)) list.push(entry);
}

export const REPO_URL = "https://github.com/stacknoise/detailed-energy-card";

/** Page-wide flag, so a script loaded twice logs only once. */
export interface BannerTarget {
  __DETAILED_ENERGY_CARD_LOGGED__?: boolean;
}

/** Logs name, version and repository of the card once per page, in the style of other Home Assistant cards. */
export function logBannerOnce(version: string, target: BannerTarget, log: (...args: unknown[]) => void = console.info): void {
  if (target.__DETAILED_ENERGY_CARD_LOGGED__) return;
  target.__DETAILED_ENERGY_CARD_LOGGED__ = true;
  log(
    `%c DETAILED-ENERGY-CARD %c ${version} %c ${REPO_URL}`,
    "color: #fff; background: #03a9f4; font-weight: 700; border-radius: 3px 0 0 3px",
    "color: #03a9f4; background: #fff; font-weight: 700; border-radius: 0 3px 3px 0",
    "color: inherit",
  );
}
