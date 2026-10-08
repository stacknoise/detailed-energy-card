/**
 * Color values end up in inline `style` attributes, so they must be a single CSS color and
 * nothing else: no `;`, `:`, `url(` or other functions that could add declarations or load
 * external resources.
 */
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const THEME_VAR = /^var\(--[\w-]+\)$/;
const COLOR_FN = /^(?:rgba?|hsla?)\((?:[\d.\s,/%+-]|deg)+\)$/i;
/** Named colors such as `red` or `rebeccapurple` (letters only, so they cannot add CSS). */
const NAMED = /^[a-z]+$/i;

/** Accepts empty, "theme", hex, rgb()/hsl(), named CSS colors and var(--theme-variable). */
export function isValidColor(value: unknown): boolean {
  if (value === undefined || value === null || value === "" || value === "theme") return true;
  if (typeof value !== "string") return false;
  const v = value.trim();
  return HEX.test(v) || THEME_VAR.test(v) || COLOR_FN.test(v) || NAMED.test(v);
}
