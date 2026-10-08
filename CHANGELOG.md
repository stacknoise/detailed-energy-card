# Changelog

## Unreleased

### Changed

- The remembered floor and room selection is stored by `floor_id` / `area_id` instead of by name. It now survives renaming a floor or area and changing colors, names or consumers. The selection is reset once on upgrade, and old storage entries are removed.
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
