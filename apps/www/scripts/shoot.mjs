#!/usr/bin/env node
// Full-page screenshots of send0.dev at 1440, 1024 and 390 wide, light and dark, with reduced motion
// (so scroll reveals and the hero demo show their final state).
//
//   node scripts/shoot.mjs [url] [--out dir] [--widths 1440,390] [--themes light] [--name home]
//
// Default URL is the local Worker preview (`pnpm preview`, http://localhost:8787).
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const here = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const positional = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));

const url = positional[0] ?? "http://localhost:8787/";
const out = path.resolve(flag("out", path.join(here, "..", "shots")));
const widths = flag("widths", "1440,1024,390").split(",").map(Number);
const themes = flag("themes", "light,dark").split(",");
const name = flag("name", new URL(url).pathname.replace(/^\/|\/$/g, "").replace(/\//g, "-") || "home");
const heights = { 1440: 900, 1024: 768, 390: 844 };

await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--hide-scrollbars"] });

try {
  for (const theme of themes) {
    for (const width of widths) {
      const page = await browser.newPage();
      await page.setViewport({ width, height: heights[width] ?? 900, deviceScaleFactor: 1 });
      await page.emulateMediaFeatures([
        { name: "prefers-reduced-motion", value: "reduce" },
        { name: "prefers-color-scheme", value: theme },
      ]);
      const target = new URL(url);
      target.searchParams.set("theme", theme);
      await page.goto(target.href, { waitUntil: "networkidle0", timeout: 30_000 });
      await page.evaluate(() => document.fonts.ready);
      // Walk the page once so lazy images load before the full-page capture.
      await page.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += 800) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 30));
        }
        window.scrollTo(0, 0);
      });
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      const file = path.join(out, `${name}-${width}-${theme}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`${file}  (${width}×${height})`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
