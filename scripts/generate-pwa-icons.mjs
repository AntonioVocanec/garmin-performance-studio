import { chromium } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svg = await readFile(path.join(root, "public/icons/garmin-studio.svg"), "utf8");
const browser = await chromium.launch({ headless: true });
try {
  for (const size of [192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(svg, { waitUntil: "load" });
    await page.locator("svg").evaluate((element, dimension) => {
      element.setAttribute("width", String(dimension));
      element.setAttribute("height", String(dimension));
    }, size);
    await page.locator("svg").screenshot({ path: path.join(root, `public/icons/icon-${size}.png`) });
    await page.close();
  }
} finally {
  await browser.close();
}
await mkdir(path.join(root, "public/icons"), { recursive: true });
