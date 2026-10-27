# Changelog

## Unreleased

### Docs

- The screenshots of the README are rendered in English (demo data, titles and editor in English; `SHOT_LANG=de npm run screenshots` renders them German). The frame of the card images is a little higher (910 px) for the longer English texts.
- README, section *Options*: the first column of every table shows the text of the field in the editor (English), next to the YAML key.
- README: the image links carry `?v=3`, so that GitHub and HACS show the English screenshots instead of cached German ones. Raise the number when the screenshots change.
- The last two German screenshots (`card-without-floors`, `card-many-rooms-wrapped`) are English now; all titles of the dev scenarios are English for `?lang=en`.

## 1.2.1

### Changed

- Editor: many fields have a help text under them (the start view and the views, the second value, prices, base load, standby, the own meter of a floor or room, the sensors of a consumer, switch and actions, the heatmap card). The field *Selection ID (optional)* is now called *Name of the remembered selection* and says when it is needed (only for several cards with the same floors and rooms). The long labels of *Compact view*, *Show base load*, *Always-on from* and the switch of a consumer are short now, the help text carries the explanation.

### Docs

- README: a section *Options* before the example with tables of all options (card, `options`, sources, floors and rooms, consumers, actions, heatmap card); the screenshots of the preview are grouped by topic.

## 1.2.0

The release of the expansion concept: three views (tree, Sankey diagram, timeline), meters of floors and rooms, a second value under every node, feed-in and battery charging, costs, base load, a heatmap card, browsing the periods, actions and switches, a compact view and a wizard that takes the structure from the Energy dashboard. Every new option is optional: existing configurations run unchanged. The remembered selection stays as it is.

### Added

**Views and charts**

- Timeline view: stacked bars per hour of today or per day of the week or month, the previous period dashed, numbers above (used so far, change against the previous period up to the same time, largest bar). The stack follows the selection (floors, rooms, consumers); the legend goes one level down, the path in the head back up. New options `options.view` (`tree` | `timeline`) and `options.views` with fields under *General*; with two views a switch appears next to *Now | Today | Week | Month*. The timeline needs energy sensors.
- Sankey diagram (`options.view: sankey`, also in `options.views`): bands from the sources through floors (without floors: rooms) and *Unassigned* to rooms and the consumers of the selected room, in the energy mode and in the mode *Now* (the bands slide to their new places). A click on a floor shows its rooms, a click on a room its consumers; feed-in and battery charging are nodes of their own below, fed by PV first. Sources are split over the floors in proportion (the tooltip says so). It needs no energy sensor.
- Compact view (`options.compact: true`, editor: *Compact view*): only sources, home and floors (without floors: rooms) in circles of 40 instead of 56 px, floor values under their names, no consumer list, no view switch, no selection; a click opens the dialog of the sensor of the node. The card reports less height (`getCardSize` 4, minimum 4 columns).
- Browsing the periods: in the energy mode the arrows ‹ › next to *Today | Week | Month* step back through earlier days, weeks and months (the head names the period: "Yesterday", "Mon 19.10.", "KW 43", "September"); › stops at the running period. Values, costs, Sankey diagram and timeline follow; the timeline compares a finished period with the whole period before it. Not remembered: a reload, another period or the mode *Now* returns to the running period.

**Meters, second value and energy**

- Floors and rooms can have their own meter: `entity` (power) and `energy_entity` (energy), both optional, with fields in the editor. With a meter the node shows the measured value and a small meter icon instead of the sum of its children; a room with a meter needs no consumers. An unreadable meter falls back to the sum and shows a warning.
- "Unassigned in <room>" and "Unassigned in <floor>": what the consumers of a metered room or floor do not cover.
- A warning when the consumers of a room (or the rooms of a floor) measure more than its meter: more than 5 % and at least 10 W or 50 Wh. The node gets a warning icon, the list says by how much.
- `options.secondary_value` (editor: *Second value under the values*): a second, smaller value under every source, floor, room and the home, and a fourth column in the consumer list. `today` shows the energy of today in the mode *Now* (loaded in the background every 5 minutes while the card is visible), `power` the power now in the energy mode, `auto` the other value of whichever mode is shown. Nodes without a value leave the line empty instead of showing 0 kWh.
- Feed-in and battery charging in the energy mode: `energy_entity_return` on grid, battery and generic sources (editor: *Energy sensor of the other direction*). The node keeps the import (battery: discharged) as its value and shows "feed-in 3.8 kWh" / "charged 2.4 kWh" in a small line below; the line follows the balance. This closes the gap of 1.0.0.
- Second badge *Self-consumption* next to the self-sufficiency: (solar − feed-in) / solar, shown only when it can be computed (in the power mode from the grid export, in the energy mode from the feed-in counter). `options.show_self_consumption: false` (editor: *Show self-consumption*) hides it. On narrow cards the badges wrap.

**Costs, base load and standby**

- Costs: `options.price` (fixed per kWh) or `options.price_entity` (dynamic tariff, hourly means from the statistics), `options.feed_in_price` / `options.feed_in_price_entity`, `options.currency`, with fields under *General*. Only energy from the grid costs money: every hour has a grid share (grid import over the consumption of the home), solar and battery cost nothing. A badge "Kosten 3,84 € · Vergütung 1,20 €" shows the shown period (in the mode *Now* today); it takes the amount of the cost statistics of the Energy dashboard (`<grid counter>_cost`, `_compensation`) when Home Assistant keeps them, and says in its tooltip what the battery charged from the grid and when a price was missing for more than 3 hours (≈). New `options.secondary_value: cost` shows the costs of every node, with energy and the part from the grid in the tooltip. The costs need an energy counter on the grid; the editor checks that a price sensor is recorded as statistics.
- Base load and standby: `options.show_base_load` shows a badge *Base load* (the lowest hourly mean of the home between 1 and 5 o'clock in the last 7 nights), `options.standby_watts` marks consumers that never fell below that power in the last 24 hours with an infinity symbol. Both read the hourly means of the power sensors from the statistics, once an hour, and show nothing without them. Editor fields under *General*.

**A second card**

- Heatmap card `custom:detailed-energy-heatmap-card` (in the same file, with its own editor): a row per day, a column per hour, the color is the consumption of that hour; hours without statistics are hatched. Figures above: base load, total of the days and the most expensive hour (optional `price` / `price_entity`, `currency`; else the peak hour). Options `entity`, `days` (7 to 28), `title`.

**Editor, actions and consumers**

- Import wizard in the editor (*Import from Energy dashboard*): proposes sources, floors, rooms and devices from `energy/get_prefs` and the areas of Home Assistant, in three steps (sources with their power sensor, structure with ticks, renaming and moving of devices, preview as a live card), then replaces the structure or adds what is missing. Devices that are part of another (`included_in_stat`) are handled so that nothing is counted twice; external statistics are shown but cannot be taken over. A plug that the dashboard lists as a grid source and as a device (to give it a price) is offered as a device only; the power sensor is read from `stat_rate` or `power_config`.
- Consumers may have only an energy counter: `entity` (power) is optional when `energy_entity` is set (a consumer needs at least one of them, else `consumers[i]: entity or energy_entity is required`). In the mode *Now* such a consumer is greyed out ("No power sensor configured", 0 W, no warning icon); in the energy mode it counts. The editor field *Power sensor* is optional. First step of the Energy-dashboard wizard.
- Actions and switches: `tap_action`, `hold_action` and `double_tap_action` (Home Assistant standard: `more-info`, `toggle`, `navigate`, `url`, `perform-action` / `call-service`, `none`, `confirmation`) on sources, floors, rooms and consumers; without them a click does what it did before. A consumer can have `switch_entity` (switch, input_boolean, light, fan): the list shows a toggle at the end of its row, `confirm_switch` asks before it is turned off. The card runs the actions itself, a hold is 500 ms, a double tap 250 ms. The editor has the action selector of Home Assistant for the three actions and fields for the switch.

### Changed

- The fields *Start chart* and *Charts in the switch* appear in the editor without an energy sensor too (the Sankey diagram does not need one); the timeline is still only offered with energy sensors.
- The "Unassigned" row of the list belongs to what the list shows: a selected room shows its own remainder (only with a room meter), a floor with all its rooms its own (only when the floor or one of its rooms has a meter), the home the rest of the home. Before, every list showed the remainder of the whole home, also the list of a single room.
- The editor hint for the energy switch and the README name floors and rooms as places for an energy sensor too.

### Docs

- README: meters of floors and rooms, the second value, feed-in and self-consumption, new screenshots `card-meters`, `card-secondary`, `card-feedin`, `card-timeline` and `card-costs`, all dev scenarios listed. The card screenshots in the power mode show the new badge. The screenshots with a room list no longer show the remainder of the home.

### Internal

- Groundwork for more views (package P3 of the expansion concept), no visible change: the tree diagram is drawn by its own `TreeView` (`src/view/tree.ts`); the energy statistics are loaded as hourly or daily rows (`loadEnergySeries`) for any period, earlier ones included (`periodRange` with an offset); loading, keeping and refreshing them moved into an `EnergyStore` (`src/model/energy-store.ts`) that can hold several queries side by side; a view switch next to *Now | Today | Week | Month* appears once a second view exists, and the chosen view is remembered with mode and period.
- The energy store loads hourly rows for whole weeks and months incrementally: a refresh only asks for the rows from the latest one on and keeps the older ones. Queries can read the mean of a measurement (prices) and the change of other totals (costs).

## 1.1.2

### Added

- Editor: as long as no energy sensor is entered, *General* shows a hint that the switch *Now | Today | Week | Month* needs an energy sensor on the home, a source or a consumer. Before, the switch was simply missing and nothing said why.
- When it loads, the card writes its name, version and repository link once to the browser console, like other Home Assistant cards. The version comes from `package.json` at build time.

### Docs

- README: new section *Credits* (author, original repository, product page, MIT license).
- README: the sentence on when the energy switch appears is now at the start of the energy mode paragraph and in bold.

### Internal

- Updated dev dependencies (Dependabot).

## 1.1.1

### Documentation

- The card is now in the HACS default store. The README describes installing it from the HACS search instead of a custom repository, and the section about the rename from `energy-card` is removed. This release brings the new README to HACS.

### Internal

- Updated dev dependencies and GitHub Actions (Dependabot).

## 1.1.0

### Added

- `options.storage_id` (editor: *Selection ID*): two cards with the same floors and rooms, say a power and an energy view, no longer share the remembered selection and view when each has its own id.

### Changed

- The key of the remembered selection is built from the ids without a hash, so different structures can no longer collide. The remembered selection is reset once; the old entries are removed.
- The old entries in `localStorage` are looked for once per page load instead of with every configuration change.

### Fixed

- Energy mode: the values are loaded again when the card is attached again (moved in the edit mode, view change) and when it becomes visible after being hidden. Before, the card could stay on "Loading energy data ..." or show old numbers until a power sensor changed.
- Editor: an `energy_entity` already used by another consumer is no longer offered and a duplicate is reported, like for `entity`. Switching floors off no longer assigns such a sensor twice.
- Energy mode: `first_weekday: language` (the Home Assistant default) now takes the first day of the week from the language instead of always Monday, so the week matches the Energy dashboard.
- Editor: the notes *err_not_energy* / *err_energy_unit* about an energy sensor update as soon as that sensor changes, not only after another field was edited.
- Editor: the *Decimals* field no longer shows 2 when nothing is set. It is empty and its label says what applies (2 for power, 1 for energy), as the card always did.

### Internal

- `render()` only reads: the positions of the floors and rooms and the start of the slide after a selection change are computed in `willUpdate()`.

### Docs

- `Entwicklungskonzept.md` (section 8) and the README describe how card and editor texts are looked up by typed keys and how to add a new text.

## 1.0.2

### Internal

- Editor texts are looked up by typed keys (`section_general`, `thr_insert_defaults`, ...) instead of the German text. German and English share one key type, so a missing translation or a mistyped key fails the type check. No visible change: every text is the same in both languages.

## 1.0.1

### Fixed

- Editor: the toggle of the *Own thresholds* and the factor field of "scale limits" no longer use the browser's light default style, they follow the dark theme of Home Assistant.
- An `energy_entity` of a consumer can no longer be assigned twice (validation error, like `entity`).

### Docs

- `Entwicklungskonzept.md`: the YAML overview (section 3) lists the energy options (`energy_entity`, `home.total_energy_entity`, `options.mode`, `options.energy_periods`).
- All card screenshots in the README have the same size (one fixed frame, a shorter card shows the dark page below it), and the dev page draws the card like Home Assistant does (background, border, rounded corners). The README shows them in rows of two, thresholds and energy mode included.
- New editor screenshots with demo data (general options, thresholds per level, energy sensors, structure), rendered by `npm run screenshots` from the dev page (`?editor=editor`).

## 1.0.0

### Added

- Energy mode: the card can show the energy of today, this week or this month in kWh. Give sources and consumers an `energy_entity` (and optionally `home.total_energy_entity`); a switch *Now | Today | Week | Month* appears. The values come from the long-term statistics of Home Assistant, no `utility_meter` helpers needed. Lines show the share of the consumption instead of a flow; elements without an energy sensor are shown as unavailable.
- `options.mode` (`power` or `energy`, the view the card starts with) and `options.energy_periods` (which periods the switch offers). The view and period are remembered like the selection.
- Editor: fields for the energy sensors (checked for `device_class: energy` and a Wh / kWh / MWh unit), the start view and the periods.

## 0.11.0

### Added

- `options.show_consumers` (default on): set it to `false` to hide the list of consumers under the diagram.
- `options.only_active_consumers` (default off): list only consumers that draw power (1 W or more). The header shows how many of the room's consumers are listed ("4 / 6"), a room with nothing active says so. Sensors that cannot be read stay listed as warnings.
- Editor: switches for both under *General* (the second one and "Unassigned" are hidden while the list is hidden).

## 0.10.0

### Added

- `options.focus_selected` (default off): the selected floor or room slides to the middle under its parent while the other elements of its level fade out behind it. Its children are spread around the new middle as usual. A click on an element always shows its children: the home shows all floors, a floor (also the selected one) shows all its rooms. With the option the card starts with all floors visible (no floor is preselected), so the first level is always fully shown. Hidden elements cannot be clicked or reached with the keyboard. With reduced motion nothing slides, elements only fade.
- Editor: a switch for it under *General*.

## 0.9.3

### Fixed

- `wrap_rooms` wraps into two rows only when a single row would be too narrow (less than 80 px per room). On a wide card, all rooms stay on one row.
- Room names no longer run into each other on small displays with many rooms (with or without wrapping). A room's name is cut with an ellipsis at the width of its column (the full name is the tooltip), and narrow columns use a smaller label font.

## 0.9.2

### Changed

- Editor: the thresholds section is collapsible and starts closed, with the number of ranges as a summary. Each range is collapsible too and shows its color, limit and line width in its header. A new range opens right away.

## 0.9.1

### Added

- Thresholds on single elements: a source, floor, room or consumer can have its own `thresholds` list that replaces the list of its level for that element only. Precedence: element, level, `colors.thresholds`.
- Editor: every source, floor, room and consumer has a collapsible *Own thresholds* section. Every threshold list also has a "scale limits" button (factor field) that multiplies all limits of the shown list, and a button to copy the parent list.

## 0.9.0

### Added

- A threshold range can set the line width with `width` (0.5 to 12 px). It replaces the width that follows the power; the list bar takes it as its height.
- Thresholds per level: `colors.level_thresholds` takes own lists for `source`, `floor`, `room` and `consumer`. A level without its own list uses `colors.thresholds`.
- Editor: *Colors → Thresholds* has a level selector, a width field per range, traffic-light defaults per level, a button to copy the shared list, and a warning when a level lower in the graph has higher limits than the one above.

## 0.8.1

### Changed

- Sources without a name are called PV / Batterie / Netz / Quelle in German and Solar / Battery / Grid / Source otherwise, following the language of the user. The suggested starting configuration no longer writes the German name "Netz" and titles the card in the user's language; the card picker description is localized too.
- Power ranges (thresholds) are no longer shown by color alone: higher ranges also draw thicker lines and list bars.
- Consumers without power in the list are faded through a muted text color and a lighter bar instead of opacity, so their text keeps a readable contrast (Lighthouse accessibility score 100 in the dev preview).
- Editor: all icon buttons, color swatches and the color picker have an accessible name (`aria-label`) for screen readers.
- README: explains how negative consumer values are handled.

## 0.8.0

### Fixed

- A changed language or home name (`location_name`) now updates the card without a sensor change.
- Loading the card script twice (for example as two dashboard resources) no longer throws "already defined" and no longer adds a second entry to the card picker.

### Changed

- The visual editor no longer renders again for every state change in Home Assistant; it updates only when a sensor used in the card, the language, the theme or the floors and areas change.
- The flow-line animation pauses while the card is scrolled out of view, which saves CPU on long dashboards.
- **Upgrade note:** the remembered floor and room selection is reset once. It is now stored by `floor_id` / `area_id` instead of by name, so it survives renaming a floor or area and changing colors, names or consumers. Old storage entries are removed.
- A damaged stored selection is ignored instead of causing errors.

## 0.7.2

### Fixed

- The self-sufficiency (autarky) badge is hidden when no grid source is configured or the grid sensor is unreadable, instead of showing a misleading 100 %.
- Sensors with a wrong unit (for example kWh or V) are no longer counted as watts. The card shows a warning for them.
- The editor's floor switch no longer drops rooms without a floor silently. It stays disabled until floors and areas are loaded, shows which rooms were hidden, and switching floors off restores them.
- Floors and areas are read from `hass.areas` / `hass.floors` when available. The WebSocket fallback retries at most every 30 seconds after a failure.

### Changed

- The config is validated up front with path-specific error messages:
  - `decimals` must be an integer from 0 to 20.
  - Option types (`unit`, booleans, color preset) are checked.
  - Colors must be a single CSS color (hex, `rgb()`/`hsl()`, named color, `var(--x)` or `theme`). Values that could inject extra CSS are rejected.

### Internal

- Updated to Vite 8, Vitest 5 and TypeScript 7.
- CI and release workflows hardened: pinned action versions, least-privilege permissions, build provenance attestation.
- Dependabot added for npm and GitHub Actions.
