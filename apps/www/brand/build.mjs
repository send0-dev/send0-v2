#!/usr/bin/env node
// Builds the send0 brand files from one geometry: the ‹0› mark, the "send0" wordmark outlined from
// Martian Mono 600, the favicons and the OG image.
//
//   pnpm --filter @send0/www brand
//
// Writes the source SVGs to brand/ and the served files to public/. The PNGs are rendered with Chrome
// (puppeteer-core; CHROME_PATH to override).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as fontkit from "fontkit";
import puppeteer from "puppeteer-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const mod = (p) => path.join(root, "node_modules", p);
const r = (n) => Math.round(n * 100) / 100;

// The site's light tokens (src/styles/global.css).
const PAPER = "#FBFAF7";
const INK = "#15141A";
const MUTED = "#6B6973";
const LINE = "#E4E2DC";
const LINE_2 = "#D3D0C8";
const ACC = "#4B2EFF";

// ── The mark ────────────────────────────────────────────────────────────────
// A zero (an ellipse, not a glyph) between two angle brackets, as in <msg_…@send0.email>.
// The same 34×22 drawing as src/components/Logo.astro.
const MARK_W = 34;
const MARK_H = 22;
const markShapes = '<path d="M8 3.5 2.5 11 8 18.5"/><path d="M26 3.5 31.5 11 26 18.5"/><ellipse cx="17" cy="11" rx="4.4" ry="7"/>';
const strokeAttrs = (color, width = 2.4) =>
  `fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`;
const markSvg = (color) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK_W} ${MARK_H}" ${strokeAttrs(color)}>${markShapes}</svg>\n`;

// ── The wordmark ────────────────────────────────────────────────────────────
// "send0" in Martian Mono 600, outlined so the logo never depends on a font being loaded. Set as in the nav:
// 19px type, -0.04em tracking, 10px after a 34×22 mark, centred on the mark the way flexbox centres a line box.
const font = fontkit.create(readFileSync(mod("@fontsource/martian-mono/files/martian-mono-latin-600-normal.woff")));
const SIZE = 19;
const k = SIZE / font.unitsPerEm;
const run = font.layout("send0");
let pen = 0;
const glyphPaths = run.glyphs.map((g, i) => {
  const d = g.path.scale(k, -k).translate(pen, 0).toSVG();
  pen += run.positions[i].xAdvance * k + (i < run.glyphs.length - 1 ? -0.04 * SIZE : 0);
  return d;
});
const wordW = pen;
const lineBox = ((font.ascent - font.descent) / font.unitsPerEm) * SIZE;
const baseline = MARK_H / 2 - lineBox / 2 + (font.ascent / font.unitsPerEm) * SIZE;
const GAP = 10;
const lockW = MARK_W + GAP + wordW;

function lockupSvg(color, { title = true } = {}) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r(lockW)} ${MARK_H}"${title ? ' role="img" aria-label="send0"' : ""}>` +
    `<g ${strokeAttrs(color)}>${markShapes}</g>` +
    `<path fill="${color}" transform="translate(${MARK_W + GAP} ${r(baseline)})" d="${glyphPaths.join("")}"/>` +
    `</svg>\n`
  );
}

// ── Favicon ─────────────────────────────────────────────────────────────────
// A square accent tile with the mark in white: it holds up on light and dark tab bars alike.
// The stroke is a little heavier than on the site so the zero stays open at 16px.
function tileSvg(size, { fill = 0.78, stroke = 3 } = {}) {
  const s = (size * fill) / MARK_W;
  const x = (size - MARK_W * s) / 2;
  const y = (size - MARK_H * s) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" fill="${ACC}"/>` +
    `<g transform="translate(${r(x)} ${r(y)}) scale(${r(s)})" ${strokeAttrs("#FFFFFF", stroke)}>${markShapes}</g>` +
    `</svg>\n`
  );
}

const out = (p, s) => {
  writeFileSync(path.join(root, p), s);
  console.log(p);
};
out("brand/mark.svg", markSvg("currentColor"));
out("brand/lockup.svg", lockupSvg("currentColor"));
out("brand/lockup-ink.svg", lockupSvg(INK));
out("brand/lockup-paper.svg", lockupSvg(PAPER));
out("public/favicon.svg", tileSvg(32));

// ── OG image ────────────────────────────────────────────────────────────────
// The spec sheet in miniature: paper, six guide columns, ticks, a figure caption and the mono headline.
const fontUrl = (p) => pathToFileURL(mod(p)).href;
const cols = Array.from({ length: 6 }, () => "<span></span>").join("");
const cells = Array.from(
  { length: 36 },
  (_, i) => `<i class="${[7, 20, 29].includes(i) ? "on" : [12, 33].includes(i) ? "open" : ""}"></i>`,
).join("");
const ogHtml = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:M;font-weight:100 800;font-stretch:75% 112.5%;src:url(${fontUrl("@fontsource-variable/martian-mono/files/martian-mono-latin-standard-normal.woff2")})}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:${PAPER};color:${INK};font-family:M;position:relative;overflow:hidden}
.guides{position:absolute;inset:0 60px;display:grid;grid-template-columns:repeat(6,1fr);border-inline:1.5px solid ${LINE}}
.guides span{border-right:1.5px solid ${LINE}}.guides span:last-child{border-right:0}
.in{position:absolute;inset:0 60px;padding:56px 48px 0;display:flex;flex-direction:column}
.top{display:flex;justify-content:space-between;align-items:center;font:500 17px M;color:${MUTED};letter-spacing:.06em}
.top svg{height:46px;width:auto}
h1{margin-top:64px;font-weight:400;font-size:92px;line-height:1.02;letter-spacing:-.055em;font-variation-settings:"wdth" 88;max-width:960px}
.rule{position:absolute;left:0;right:0;bottom:118px;border-top:1.5px solid ${INK}}
.ticks{position:absolute;left:60px;right:60px;bottom:109px;display:grid;grid-template-columns:repeat(6,1fr)}
.ticks span{border-left:1.5px solid ${INK};height:9px}.ticks span:last-child{border-right:1.5px solid ${INK}}
.foot{position:absolute;left:108px;right:108px;bottom:40px;display:flex;justify-content:space-between;align-items:center;font:500 20px M}
.pill{display:inline-flex;align-items:center;gap:12px;border:1.5px solid ${LINE_2};padding:9px 14px}
.pill i{width:11px;height:11px;background:${ACC}}
.grid{display:grid;grid-template-columns:repeat(12,14px);gap:8px}
.grid i{width:14px;height:14px;background:${LINE_2}}.grid i.on{background:${ACC}}.grid i.open{background:transparent;outline:2px solid ${ACC};outline-offset:-2px}
</style>
<div class="guides">${cols}</div>
<div class="in">
<div class="top">${lockupSvg(INK, { title: false })}<span>[ fig. 0 — send0.dev ]</span></div>
<h1>Email infrastructure for AI agents</h1>
</div>
<div class="rule"></div><div class="ticks">${cols}</div>
<div class="foot"><span class="pill"><i></i>open source · self-hostable · webhooks</span><span class="grid">${cells}</span></div>`;

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const tmp = mkdtempSync(path.join(tmpdir(), "send0-brand-"));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--allow-file-access-from-files"] });
try {
  const shot = async (html, w, h, file) => {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    // A file:// page so the local font files load.
    const htmlFile = path.join(tmp, "render.html");
    writeFileSync(htmlFile, html);
    await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(root, file), clip: { x: 0, y: 0, width: w, height: h } });
    await page.close();
    console.log(file);
  };
  const bare = (svg, size) => `<!doctype html><style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`;
  await shot(bare(tileSvg(180, { fill: 0.66, stroke: 2.6 }), 180), 180, 180, "public/apple-touch-icon.png");
  await shot(bare(tileSvg(32), 32), 32, 32, "public/favicon-32.png");
  await shot(ogHtml, 1200, 630, "public/og.png");
} finally {
  await browser.close();
  rmSync(tmp, { recursive: true, force: true });
}
