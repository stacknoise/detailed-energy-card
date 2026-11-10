import { SOURCE_COLORS } from "../model/mix";

/**
 * CSS of the 3D graphic (AP3). `renderHouse` puts it into the SVG as a `<style>` element, so the graphic looks the
 * same in the card, in tests and in the picture comparison, and the card needs no extra style rule. Colors come from
 * the theme variables of Home Assistant (and the `--_…` variables of the energy card where the card sets them);
 * the face colors derive from them with `color-mix`, so light and dark themes need no extra rules.
 * The measures are those of the mock `docs/mockups/3d/house-view-mock.html`.
 */
export const HOUSE_CSS = `
.house{
  --h-surface:var(--ha-card-background,var(--card-background-color,#fff));
  --h-text:var(--_text,var(--primary-text-color,#161c26));
  --h-muted:var(--_muted,var(--secondary-text-color,#566174));
  --h-line:var(--_line,var(--divider-color,#d5dbe4));
  --h-accent:var(--_accent,var(--primary-color,#488fc2));
  --h-solar:${SOURCE_COLORS.solar};--h-batt:${SOURCE_COLORS.battery};--h-grid:${SOURCE_COLORS.grid};
  --h-wall:color-mix(in srgb,var(--h-text) 12%,var(--h-surface));
  --h-room:color-mix(in srgb,var(--h-text) 24%,var(--h-surface));
  display:block;width:100%;height:auto;max-height:640px;overflow:visible;
}
.house .t{fill:var(--ct)} .house .l{fill:var(--cl)} .house .r{fill:var(--cr)}
.house .wall{--ct:color-mix(in srgb,var(--h-wall),#fff 15%);--cl:var(--h-wall);--cr:color-mix(in srgb,var(--h-wall),#000 18%)}
.house .room{--ct:color-mix(in srgb,var(--h-room),#fff 25%);--cl:var(--h-room);--cr:color-mix(in srgb,var(--h-room),#000 12%)}
.house .battery{--ct:color-mix(in srgb,var(--h-batt),#fff 30%);--cl:var(--h-batt);--cr:color-mix(in srgb,var(--h-batt),#000 22%)}
.house .solar{--ct:color-mix(in srgb,var(--h-solar),#fff 25%);--cl:var(--h-solar);--cr:color-mix(in srgb,var(--h-solar),#000 22%)}
.house .grid{--ct:color-mix(in srgb,var(--h-grid),#fff 30%);--cl:var(--h-grid);--cr:color-mix(in srgb,var(--h-grid),#000 22%)}
.house polygon{stroke:var(--h-line);stroke-width:.5;stroke-linejoin:round}
.house .ground{fill:color-mix(in srgb,var(--h-text) 7%,var(--h-surface));stroke:none}
.house .dim{opacity:.35}
.house .pick{cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent}
.house .sel polygon{stroke:var(--h-accent);stroke-width:1}
.house .pick:focus-visible polygon{stroke:var(--h-accent);stroke-width:1.5}
.house .fl{fill:none;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
.house .fl.bg{opacity:.2}
.house .fl.fg.on{stroke-dasharray:5 7}
.house .fl.fg.idle{opacity:.5}
.house.animate .fl.fg.on{animation:house-dash 1s linear infinite}
.house .node{pointer-events:none}
@keyframes house-dash{to{stroke-dashoffset:-12}}
@media (prefers-reduced-motion:reduce){.house.animate .fl.fg.on{animation:none}}
.house .lbl{font-family:var(--ha-font-family-body,var(--paper-font-body1_-_font-family,system-ui,sans-serif));font-size:7px;font-weight:500;fill:var(--h-text);paint-order:stroke;stroke:var(--h-surface);stroke-width:3px;stroke-linejoin:round;pointer-events:none}
.house .lbl .kw{font-weight:700}
.house .lbl.big{font-size:8px}
.house .lbl.src{font-weight:700}
`;
