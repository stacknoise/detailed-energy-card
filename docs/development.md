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

`npx vite` serves `dev/index.html`, a mock-data preview. Pick a scenario with `?scenario=floors|flat|many|wrap|long|thresholds|focus|energy|meters|secondary|feedin|timeline|sankey|standby|costs|mix|surplus|today|strands|battery|origin|duplicate|invalid` (`meters`: own meters of floors and rooms, `secondary`: the second value, `feedin`: feed-in and charging, `timeline`: the timeline view, `sankey`: the Sankey diagram, `standby`: base load and always-on consumers, `costs`: costs from a dynamic price, `mix`: source mix, battery forecast and solar split, `surplus`: the same with a solar surplus, `today`: surplus banner, source-colored lines and the values of today, `strands`: lines as strands in the mix, `battery`: charge bar with limits, `origin`: origin of the power in the list).

Locally the browser tests use the installed Microsoft Edge; in CI they use Chromium (`npx playwright install chromium`).

The screenshots in the README are rendered from mock data with `npm run screenshots`, in English (`SHOT_LANG=de` renders them in German). The editor screenshots draw the form fields with a stand-in for Home Assistant's form (`dev/ha-form-stub.js`), so they look like the real ones but are not taken in a real Home Assistant. The image links in the README carry `?v=5`, so that GitHub and HACS do not show cached old images: raise the number when the screenshots change.
