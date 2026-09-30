// Draws the project icon (docs/icon.svg) and renders docs/icon.png (512x512) and
// docs/social-preview.png (1280x640, for the GitHub "social preview"). Run: npm run icon
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { mdiHome } from "@mdi/js";

const BLUE = "#03a9f4";
const ORANGE = "#ff9800";
const GREEN = "#4caf50";

const node = (x, y, r, color) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="#1c1f26" stroke="${color}" stroke-width="10"/>`;
const flow = (d, color) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="4 22"/>`;

// Sources on top, home in the middle, rooms below: the card in one glance.
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="96" fill="#111318"/>
  ${flow("M116 124 C116 190 256 170 256 226", ORANGE)}
  ${flow("M256 124 L256 226", BLUE)}
  ${flow("M396 124 C396 190 256 170 256 226", GREEN)}
  ${flow("M256 314 C256 360 116 350 116 396", BLUE)}
  ${flow("M256 314 L256 396", BLUE)}
  ${flow("M256 314 C256 360 396 350 396 396", BLUE)}
  ${node(116, 100, 44, ORANGE)}
  ${node(256, 100, 44, BLUE)}
  ${node(396, 100, 44, GREEN)}
  ${node(256, 270, 62, BLUE)}
  ${node(116, 420, 44, BLUE)}
  ${node(256, 420, 44, BLUE)}
  ${node(396, 420, 44, BLUE)}
  <g transform="translate(219 233) scale(3.08)" fill="#e1e1e1"><path d="${mdiHome}"/></g>
</svg>`;
writeFileSync("docs/icon.svg", icon);

const social = `<html><body style="margin:0;width:1280px;height:640px;background:#111318;display:flex;align-items:center;justify-content:center;gap:56px;font-family:Roboto,Segoe UI,system-ui,sans-serif">
  <div style="width:400px;height:400px">${icon.replace('width="512" height="512"', 'width="400" height="400"')}</div>
  <div style="color:#e1e1e1">
    <div style="font-size:76px;font-weight:700;line-height:1.05">Detailed Energy Card</div>
    <div style="font-size:34px;color:#9b9b9b;margin-top:18px;max-width:520px;line-height:1.3">Home Assistant power flow from sources via floors and rooms to consumers</div>
  </div></body></html>`;

const browser = await chromium.launch({ channel: process.env.CI ? undefined : "msedge" });
const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
await page.setContent(`<body style="margin:0;background:transparent">${icon}</body>`);
await page.screenshot({ path: "docs/icon.png", omitBackground: true });
await page.setViewportSize({ width: 1280, height: 640 });
await page.setContent(social);
await page.screenshot({ path: "docs/social-preview.png" });
await browser.close();
console.log("wrote docs/icon.svg, docs/icon.png, docs/social-preview.png");
