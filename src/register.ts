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
