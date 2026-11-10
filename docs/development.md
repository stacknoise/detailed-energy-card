# Development

How to build, test and release the [Detailed Energy Card](https://github.com/stacknoise/detailed-energy-card). The full concept and architecture (in German) is in [Entwicklungskonzept.md](../Entwicklungskonzept.md).

```bash
npm install
npm test            # unit tests (Vitest)
npm run build       # dist/detailed-energy-card.js
npm run test:e2e    # browser tests (Playwright) against dev/index.html
npm run screenshots # re-render docs/screenshots/*.png
npm run icon        # re-render docs/icon.png and docs/social-preview.png
```

Code documentation: `docs/code-doku/index.html` is generated from the source by `python3 docs/code-doku/generate.py` (explorer of modules, functions, classes and methods with metrics and source, plus a dependency map). **Every code change must regenerate it in the same pull request**; the build fails when it is out of date (`--check`). See [CLAUDE.md](../CLAUDE.md).

Releases: raise `version` in `package.json`, merge, then push the tag `v<version>`; the release workflow refuses a tag that does not match. Add the changes to [CHANGELOG.md](../CHANGELOG.md) first.

Texts: card and editor look up their texts by key in `src/localize/index.ts` and `src/localize/editor.ts`. Each file has a German table `de` and an English table `en: typeof de`, so a new text needs a key in both, and the type check fails when one is missing. Do not write German text directly in `src/editor/`; a test checks that.

`npx vite` serves `dev/index.html`, a mock-data preview. Pick a scenario with `?scenario=floors|flat|many|wrap|long|thresholds|focus|energy|meters|secondary|feedin|timeline|sankey|standby|costs|mix|surplus|today|strands|battery|origin|forecast|duplicate|invalid` (`meters`: own meters of floors and rooms, `secondary`: the second value, `feedin`: feed-in and charging, `timeline`: the timeline view, `sankey`: the Sankey diagram, `standby`: base load and always-on consumers, `costs`: costs from a dynamic price, `mix`: source mix, battery forecast and solar split, `surplus`: the same with a solar surplus, `today`: surplus banner, source-colored lines and the values of today, `strands`: lines as strands in the mix, `battery`: charge bar with limits, `origin`: origin of the power in the list, `forecast`: the solar forecast in the timeline).

`?card=house` shows the 3D card (scenarios `house|house-auto|house-actions|house-invalid`, `&editor=1` for its editor) and `dev/house-view.html` the bare graphic. The 3D card is built in the same bundle as the energy card (`src/house-card.ts`, `src/model/house*.ts`, `src/view/house*.ts`, `src/editor/house*.ts`, texts with the prefix `house_` in `src/localize/house*.ts`); see section 16 of [Entwicklungskonzept.md](../Entwicklungskonzept.md). Its browser tests are `e2e/house-view.spec.ts`, `e2e/house-editor.spec.ts` and `e2e/house-mock.spec.ts` (comparison with the mock in `docs/mockups/3d/`).

Locally the browser tests use the installed Microsoft Edge; in CI they use Chromium (`npx playwright install chromium`).

The screenshots in the README are rendered from mock data with `npm run screenshots`, in English (`SHOT_LANG=de` renders them in German). The editor screenshots draw the form fields with a stand-in for Home Assistant's form (`dev/ha-form-stub.js`), so they look like the real ones but are not taken in a real Home Assistant. `card-house.png` and `editor-house.png` show the 3D card and its editor. The five `house-ha-*.png` files (cards and editor dialog) are not rendered: they are screenshots of a real Home Assistant (dashboard with the 3D card, editor opened and cancelled), so they are retaken by hand when the look of the card changes. The image links in the README carry `?v=6`, so that GitHub and HACS do not show cached old images: raise the number when the screenshots change.
