import { expect, test, type Page } from "@playwright/test";

const open = async (page: Page, scenario = "house") => {
  await page.goto(`/dev/index.html?card=house&scenario=${scenario}&editor=1`);
  await page.locator("detailed-energy-house-grid svg").waitFor();
};

/** Position of the middle of grid cell (col, row) on the screen; the viewBox of the grid is -6 -6 (cols*40+12) (rows*40+12). */
const cell = async (page: Page, col: number, row: number, cols = 12, rows = 6) => {
  const b = (await page.locator("detailed-energy-house-grid svg").boundingBox())!;
  return { x: b.x + (((col + 0.5) * 40 + 6) / (cols * 40 + 12)) * b.width, y: b.y + (((row + 0.5) * 40 + 6) / (rows * 40 + 12)) * b.height };
};
const drag = async (page: Page, from: { x: number; y: number }, to: { x: number; y: number }) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
};
const rooms = (page: Page) => page.locator("detailed-energy-house-grid g.room");
// floors and rooms only: the parts of the power sources (roof, solar, pole ...) are tappable, too
const preview = (page: Page) => page.locator("detailed-energy-3d-card-editor detailed-energy-3d-card svg.house g.pick[data-key^=\"slab:\"], detailed-energy-3d-card-editor detailed-energy-3d-card svg.house g.pick[data-key^=\"room:\"]");

test("the editor shows the plan and a live preview of the card", async ({ page }) => {
  await open(page);
  await expect(rooms(page)).toHaveCount(3);
  await expect(preview(page)).toHaveCount(3 + 5); // 3 floors + 5 rooms of the scenario
});

test("General offers only what the 3D card reads", async ({ page }) => {
  await open(page);
  const ed = page.locator("detailed-energy-card-editor");
  await expect(ed).toContainText("Einheit");
  await expect(ed).not.toContainText("Kompakte Ansicht");
  await expect(ed).not.toContainText("Quellen-Mix");
});

test("drawing a room adds it to the plan and the preview", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "OG", exact: true }).click();
  await expect(rooms(page)).toHaveCount(1);
  await drag(page, await cell(page, 7, 1), await cell(page, 10, 3));
  await expect(page.getByText("Neuer Raum")).toBeVisible();
  await page.getByRole("button", { name: "Raum anlegen" }).click();
  await expect(rooms(page)).toHaveCount(2);
  await expect(preview(page)).toHaveCount(3 + 5 + 1);
});

test("a room dragged onto another one stays where it was", async ({ page }) => {
  await open(page);
  const kueche = rooms(page).first();
  const before = await kueche.getAttribute("aria-label");
  await drag(page, await cell(page, 1, 1), await cell(page, 7, 1));
  expect(await kueche.getAttribute("aria-label")).toBe(before);
});

test("a moved room moves in the preview's config too", async ({ page }) => {
  await open(page, "house");
  await page.getByRole("button", { name: "Keller", exact: true }).click();
  const room = rooms(page).first().locator("rect.rm");
  const before = (await room.boundingBox())!;
  await drag(page, await cell(page, 4, 2), await cell(page, 2, 2));
  const after = (await room.boundingBox())!;
  expect(after.x).toBeLessThan(before.x);
});
