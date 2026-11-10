<img src="https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/icon.png" alt="Detailed Energy Card icon" width="96" align="right">

# Detailed Energy Card

**See where every watt in your home goes.** From the solar panels, the battery and the grid, through your floors and rooms, right down to the coffee machine.

The Energy dashboard of Home Assistant tells you *how much* you use. This card shows you *where*: a live diagram of your home that you can click through, floor by floor and room by room, until you find the device that is eating your power.

<img src="https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-hero.png?v=5" alt="The card: solar, battery and grid flow into the home, on to the floors, the rooms of the ground floor and the consumers of the kitchen" width="380">

*Current version: **1.5.0** · [What's new](https://github.com/stacknoise/detailed-energy-card/blob/main/CHANGELOG.md)*

## Why you'll like it

- ⚡ **Live power flow.** Animated lines from every source to every floor, room and device. Set thresholds and they turn orange or red when something draws a lot.
- 🏠 **Your home, your structure.** Floors and rooms come straight from the areas you already have in Home Assistant.
- 🪄 **Set up in minutes, no YAML.** One click imports sources, rooms and devices from your Energy dashboard.
- 📅 **Today, this week, this month.** Switch from *Now* to the energy used, and browse back to yesterday or last month.
- 💶 **What did it cost?** Fixed price or a dynamic tariff such as Tibber: the card shows the costs of every room and device.
- ☀️ **Self-sufficiency and self-consumption** at a glance, plus feed-in and battery charging.
- 🎨 **Sources at a glance** (optional). A ring around the home shows where the power comes from, the battery tells you when it is full or empty, and the solar power shows where it goes. Lines in the colors of the sources, a surplus banner and tiles with today's values are optional too.
- 🔍 **Find the energy hogs.** Base load of your home, devices that never switch off, and a heatmap of *when* you use electricity.
- 📊 **Three ways to look at it:** the tree, a Sankey diagram and a timeline of the day, plus a 3D view of your home as a card of its own.
- 🎛️ **Act right away.** Turn a device off from the list, or give any element your own tap actions.
- 📱 **Fits everywhere.** A compact view for phones and dashboard corners, follows your theme, in English and German.

## Install

The card is in the HACS default store.

[![Open your Home Assistant instance and open this repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=stacknoise&repository=detailed-energy-card&category=plugin)

1. Open HACS, search for **Detailed Energy Card** and click **Download** (or use the button above).
2. Reload your browser.
3. Edit a dashboard, **Add card** and pick **Detailed Energy Card**.

## Get started in two minutes

Already using the Energy dashboard of Home Assistant? Then the card can set itself up. Click **Import from Energy dashboard** at the top of the card editor: it picks up your grid, solar and battery, sorts your devices into floors and rooms by their areas and shows you a live preview before anything is saved.

![Import wizard: the structure of the card proposed from the Energy dashboard](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/editor-import.png?v=5)

Everything else is in the visual editor too: colors, thresholds, costs, views and actions, each field with a short help text.

## A closer look

### Click through your home

| Floors, rooms and consumers | A home without floors |
| --- | --- |
| ![Card with floors](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-with-floors.png?v=5) | ![Card without floors](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-without-floors.png?v=5) |

Click a floor to see its rooms, click a room to see its devices. Click again to go back up.

### Energy and costs

| Energy of today, this week or this month | Costs of every room and device |
| --- | --- |
| ![Card in the energy mode](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-energy.png?v=5) | ![Costs badge and the costs of every node](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-costs.png?v=5) |

| Feed-in, charging and self-consumption | Base load and devices that never switch off |
| --- | --- |
| ![Feed-in and battery charging in the energy mode](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-feedin.png?v=5) | ![Base load badge and the infinity symbol at the fridge](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-standby.png?v=5) |

### Sources at a glance (optional)

Four switches in the editor, all off until you turn them on: a ring around the home with the share of solar, battery and grid, the home in the color of the largest source, the battery forecast (*Full at 17:06*, *Lasts until 06:06*) and the split of the solar power into home, battery and grid.

| The mix of the sources, and how long the battery lasts | A solar surplus: the battery charges, the rest goes into the grid |
| --- | --- |
| ![Ring around the home with solar, battery and grid, the battery says when it lasts until](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-source-mix.png?v=5) | ![Solar surplus: the battery says when it is full, the solar power is split into home, battery and grid](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-solar-surplus.png?v=5) |

### Overview (optional)

Three more switches: the lines in the colors of the sources (below the home as strands in the mix), a banner while power is fed into the grid that says what using it yourself would save (and, if you give consumers a typical power, which idle ones could use it), and tiles with the values of today under the diagram.

| Surplus banner and the values of today | Lines in the colors of the sources |
| --- | --- |
| ![Surplus banner, the solar line in orange and tiles with today's solar, grid, feed-in, battery, home and self-sufficiency](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-overview.png?v=6) | ![Lines in the colors of the sources, below the home as strands in the mix](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-source-lines.png?v=5) |

### Where does the power come from? (optional)

One more switch: in the list a ring shows how much of the power of the shown room, floor or home was solar, battery or grid, every bar is split the same way, and a hint names the hours with the least grid import, the best time for big loads.

| Origin of the power per consumer, and the best hours |
| --- |
| ![Ring with solar and grid, bars split by origin and the hint for the hours with the least grid import](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-origin.png?v=5) |

### Solar forecast in the timeline (optional)

One more switch: the timeline of today gets a dashed line with the forecast of the solar production, taken from the solar forecast of your Energy dashboard.

| Timeline of today with the solar forecast |
| --- |
| ![Timeline of today with a dashed orange line for the solar forecast](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-pv-forecast.png?v=5) |

### The 3D card (optional)

A second card that comes with the same download: **Add card → Detailed Energy 3D**. It shows your home as floors in an isometric view, with the solar panels on the roof, the grid pole in front and the battery in the basement. Dashed lines carry the power from the sources up the riser and into the floors, in the colors and widths of your thresholds. Tap a floor or a room and the rest fades out; the list below shows the consumers of your choice, with the same numbers as the energy card.

| The card | The editor with floor plan |
| --- | --- |
| ![3D card: floors with flow lines, the kitchen selected, its consumers below](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-house.png?v=5) | ![Editor of the 3D card: floor plan with rooms, grid size and live preview](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/editor-house.png?v=5) |

It is a card of its own, so nothing changes until you add it to a dashboard. It reads the same configuration as the energy card (`sources`, `floors`, `rooms`, `consumers`), so you can copy that over and only add where each room sits. The editor draws the rooms for you: drag on the floor plan to add a room, drag a room to move it, drag the dot in its corner to resize it, or type column, row, width and height. Rooms without a position are placed automatically. See [docs/configuration.md](docs/configuration.md#3d-card).

### More options for the ones who want them

All of them are off until you switch them on: a yearly budget as a bar with the use since January, the straight pace and a projection; the same day of the last year as a marker in the timeline of a week and a month; savings next to the costs; a hint when readings do not add up; and suggestions for idle devices in the surplus banner. Grid meters can have their own tariff, and a consumer can be the difference of a meter and the devices behind it. See [docs/configuration.md](docs/configuration.md).

### More ways to see it

| Timeline of the day | Sankey diagram |
| --- | --- |
| ![Timeline of today stacked by room, yesterday dashed](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-timeline.png?v=5) | ![Sankey diagram of sources, floors, rooms and consumers](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-sankey.png?v=5) |

| Heatmap: when is electricity used? | Compact view for phones |
| --- | --- |
| ![Heatmap card: a row per day, a column per hour](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-heatmap.png?v=5) | ![Compact view: sources, home and floors in small circles](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-compact.png?v=5) |

The heatmap is a second card that comes with the same download: **Add card → Detailed Energy Heatmap**.

<details>
<summary>More screenshots: thresholds, meters, switches and the editor</summary>

| Colors by power, per level | Own meters of floors and rooms |
| --- | --- |
| ![Card with thresholds per level](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-thresholds.png?v=5) | ![Floors and rooms with their own meter](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-meters.png?v=5) |

| Power now, energy of today below | Switches in the list |
| --- | --- |
| ![Power now with the energy of today below](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-secondary.png?v=5) | ![A toggle at the end of the row of a consumer with a switch](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-actions.png?v=5) |

| All rooms of a floor | Many rooms in two rows |
| --- | --- |
| ![All rooms selected](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-all-rooms.png?v=5) | ![Many rooms wrapped](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/card-many-rooms-wrapped.png?v=5) |

| Editor: general and options | Editor: thresholds |
| --- | --- |
| ![Editor: general](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/editor-general.png?v=5) | ![Editor: thresholds](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/editor-thresholds.png?v=5) |

| Editor: energy sensors | Editor: structure |
| --- | --- |
| ![Editor: energy sensors](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/editor-energy.png?v=5) | ![Editor: structure](https://raw.githubusercontent.com/stacknoise/detailed-energy-card/main/docs/screenshots/editor-structure.png?v=5) |

</details>

## Prefer YAML?

A small example to start from:

```yaml
type: custom:detailed-energy-card
title: Energy
sources:
  - { entity: sensor.pv_power, type: solar }
  - { entity: sensor.battery_power, type: battery, soc_entity: sensor.battery_soc }
  - { entity: sensor.grid_power, type: grid }
floors:
  - floor_id: ground_floor        # a floor from Home Assistant
    rooms:
      - area_id: kitchen          # an area from Home Assistant
        consumers:
          - entity: sensor.oven_power
            name: Oven
```

Every option, with its YAML key and default, is in the **[configuration reference](https://github.com/stacknoise/detailed-energy-card/blob/main/docs/configuration.md)**.

## Good to know

- **Power sensors** in W, kW or MW are all you need. For the energy mode, costs and the timeline, add energy counters (kWh) that Home Assistant keeps as long-term statistics; no `utility_meter` helpers needed.
- **Floors and rooms** are the floors and areas of your Home Assistant. Rooms that Home Assistant does not know can be added as custom rooms.
- **Requires** Home Assistant 2024.8 or newer.

## Links

- 📖 [Configuration reference](https://github.com/stacknoise/detailed-energy-card/blob/main/docs/configuration.md): all options in detail
- 📝 [Changelog](https://github.com/stacknoise/detailed-energy-card/blob/main/CHANGELOG.md)
- 🐞 [Report a bug or ask for a feature](https://github.com/stacknoise/detailed-energy-card/issues)
- 🛠️ [Development](https://github.com/stacknoise/detailed-energy-card/blob/main/docs/development.md): build, test and release

## Credits

Detailed Energy Card is made by Anton Graichen-Hartl ([stacknoise](https://stacknoise.com/energy-card)). The original repository is [stacknoise/detailed-energy-card](https://github.com/stacknoise/detailed-energy-card). The card is MIT licensed: forks and reuse are welcome, keep the copyright notice and the [LICENSE](https://github.com/stacknoise/detailed-energy-card/blob/main/LICENSE), and a link back to this repository is appreciated. When the card loads it writes its name, version and this link to the browser console.
