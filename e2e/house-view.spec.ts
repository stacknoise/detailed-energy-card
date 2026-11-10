import { expect, test, type Page } from "@playwright/test";

const open = async (page: Page, query = "") => {
  await page.goto(`/dev/house-view.html?${query}`);
  await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready);
};
const log = (page: Page) => page.evaluate(() => (window as unknown as { __log: unknown[] }).__log);
const svg = (page: Page) => page.locator("svg.house");

test("draws the mock example: 3 floors, 9 rooms, 6 solar modules, 6 flow lines", async ({ page }) => {
  await open(page, "w=700");
  await expect(svg(page).locator("g.pick")).toHaveCount(12);
  await expect(svg(page).locator("polygon.solar.t")).toHaveCount(6);
  await expect(svg(page).locator("polygon.ground")).toHaveCount(1);
  await expect(svg(page).locator("polyline.fl.fg")).toHaveCount(6);
  await expect(svg(page).locator("circle.node")).toHaveCount(6);
  await expect(svg(page).locator("text.lbl")).toHaveCount(9 + 3 + 2);
  await expect(svg(page).locator("text.lbl", { hasText: "Akku" })).toContainText("lädt 1,1 kW");
});

test("flow lines: dashed 5/7, width 2 over 5, end node radius 2.6, moving only with animation", async ({ page }) => {
  await open(page, "w=700&animate=1");
  const fg = svg(page).locator("polyline.fl.fg").first();
  const bg = svg(page).locator("polyline.fl.bg").first();
  await expect(fg).toHaveAttribute("stroke-width", "2");
  await expect(bg).toHaveAttribute("stroke-width", "5");
  expect(await fg.evaluate((e) => getComputedStyle(e).strokeDasharray.replace(/px/g, ""))).toBe("5, 7");
  expect(await fg.evaluate((e) => getComputedStyle(e).animationName)).toBe("house-dash");
  expect(await bg.evaluate((e) => getComputedStyle(e).opacity)).toBe("0.2");
  await expect(svg(page).locator("circle.node").first()).toHaveAttribute("r", "2.6");
  await open(page, "w=700");
  expect(await svg(page).locator("polyline.fl.fg").first().evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
});

test("reduced motion stops the animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "w=700&animate=1");
  expect(await svg(page).locator("polyline.fl.fg").first().evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
});

test("labels: two lines, name normal, value bold, anchors like the mock", async ({ page }) => {
  await open(page, "w=700");
  const floor = svg(page).locator("text.lbl", { hasText: "Erdgeschoss" });
  await expect(floor).toHaveAttribute("text-anchor", "end");
  expect(await floor.evaluate((e) => getComputedStyle(e).fontSize)).toBe("8px");
  expect(await floor.locator("tspan.kw").evaluate((e) => getComputedStyle(e).fontWeight)).toBe("700");
  expect(await floor.locator("tspan").first().evaluate((e) => getComputedStyle(e).fontWeight)).toBe("500");
  const room = svg(page).locator(`text.lbl[data-key="label:kueche"]`);
  await expect(room).toHaveAttribute("text-anchor", "middle");
  expect(await room.evaluate((e) => getComputedStyle(e).fontSize)).toBe("7px");
  expect(await room.evaluate((e) => getComputedStyle(e).strokeWidth)).toBe("3px");
  // the value line sits 8 units below the name line
  const ys = await room.locator("tspan").evaluateAll((t) => t.map((e) => Number(e.getAttribute("y"))));
  expect(ys[1] - ys[0]).toBe(8);
});

test("narrow (400 px): no room texts, floor and source values stay", async ({ page }) => {
  await open(page, "w=400");
  await expect(svg(page).locator(`text.lbl[data-key="label:kueche"]`)).toHaveCount(0);
  await expect(svg(page).locator("text.lbl", { hasText: "Obergeschoss" })).toContainText("0,8 kW");
  await expect(svg(page).locator("text.lbl", { hasText: "Solaranlage" })).toBeVisible();
  await expect(svg(page).locator("g.pick")).toHaveCount(12); // the rooms are still pickable
});

test("all labels lie inside the view box in both widths", async ({ page }) => {
  for (const w of [400, 700]) {
    await open(page, `w=${w}`);
    const out = await svg(page).evaluate((s: SVGSVGElement) => {
      const vb = s.viewBox.baseVal;
      return [...s.querySelectorAll("text")].filter((t) => {
        const b = t.getBBox();
        return b.x < vb.x || b.y < vb.y || b.x + b.width > vb.x + vb.width || b.y + b.height > vb.y + vb.height;
      }).length;
    });
    expect(out).toBe(0);
  }
});

test("light and dark: faces derive from the theme, top lighter than left lighter than right", async ({ page }) => {
  for (const theme of ["light", "dark"]) {
    await open(page, `w=700&theme=${theme}`);
    const lum = async (sel: string) =>
      svg(page).locator(sel).first().evaluate((e) => {
        const [r, g, b] = getComputedStyle(e).fill.match(/[\d.]+/g)!.map(Number);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      });
    for (const tone of ["wall", "room"]) {
      const t = await lum(`polygon.${tone}.t`);
      const l = await lum(`polygon.${tone}.l`);
      const r = await lum(`polygon.${tone}.r`);
      expect(t).toBeGreaterThan(l);
      expect(l).toBeGreaterThan(r);
    }
    expect(await svg(page).locator("polygon.solar.l").first().evaluate((e) => getComputedStyle(e).fill)).toBe("rgb(255, 152, 0)");
    expect(await svg(page).locator("polygon.battery.l").first().evaluate((e) => getComputedStyle(e).fill)).toBe("rgb(240, 98, 146)");
    expect(await svg(page).locator("polygon.grid.l").first().evaluate((e) => getComputedStyle(e).fill)).toBe("rgb(72, 143, 194)");
  }
});

test("a tap selects a room, a second tap clears it", async ({ page }) => {
  await open(page, "w=700");
  await svg(page).locator('g.pick[data-key="room:kueche"]').click();
  expect(await log(page)).toEqual([["select", { floor_id: "eg", area_id: "kueche" }]]);
  await expect(svg(page).locator('g.pick[data-key="room:kueche"]')).toHaveAttribute("aria-pressed", "true");
  await expect(svg(page).locator("g.pick.sel")).toHaveCount(1);
  await expect(svg(page).locator("g.pick.dim")).toHaveCount(11);
  await svg(page).locator('g.pick[data-key="room:kueche"]').click();
  expect((await log(page)).at(-1)).toEqual(["select", {}]);
  await expect(svg(page).locator("g.pick.sel")).toHaveCount(0);
});

test("keyboard: Tab reaches floors and rooms, Enter selects, aria label has name and value", async ({ page }) => {
  await open(page, "w=700");
  const first = svg(page).locator("g.pick").first();
  await expect(first).toHaveAttribute("aria-label", "Keller, 1,0 kW");
  await expect(svg(page).locator('g.pick[data-key="room:akku"]')).toHaveAttribute("aria-label", "Akku, 1,1 kW");
  await expect(svg(page)).toHaveAttribute("role", "group");
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();
  await page.keyboard.press("Enter");
  expect(await log(page)).toEqual([["select", { floor_id: "keller" }]]);
});

test("hold and double tap reach onAction", async ({ page }) => {
  await open(page, "w=700&actions=1");
  const room = svg(page).locator('g.pick[data-key="room:flur"]');
  await room.hover();
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  await room.dblclick();
  const entries = await log(page);
  expect(entries).toContainEqual(["hold", { floor_id: "eg", area_id: "flur" }]);
  expect(entries).toContainEqual(["double", { floor_id: "eg", area_id: "flur" }]);
});
