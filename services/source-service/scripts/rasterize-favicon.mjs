// Rasterize the kessoku moe app icon (SVG) into real favicon files so browser
// tabs / PWA show the brand instead of the old animeflix "A". Uses installed
// Edge (playwright-core) to render the SVG at each size, png-to-ico for .ico.
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import pngToIco from 'png-to-ico';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PUB = 'c:\\Projects\\animeflix-main\\frontend\\public';
const SVG_FILE = `${PUB}\\kessoku-moe-appicon.svg`;

const svgRaw = await fs.readFile(SVG_FILE, 'utf8');

const browser = await chromium.launch({ headless: true, executablePath: EDGE });
const ctx = await browser.newContext({ deviceScaleFactor: 1 });
const page = await ctx.newPage();

async function render(size) {
  // Force the svg to size x size; appicon already has its own rounded bg.
  const sized = svgRaw.replace(/<svg/, `<svg width="${size}" height="${size}"`);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0">${sized}</body></html>`,
    { waitUntil: 'networkidle' }
  );
  await page.waitForTimeout(250);
  return page.screenshot({ omitBackground: true });
}

const pngTargets = {
  'icons\\favicon-16x16.png': 16,
  'icons\\favicon-32x32.png': 32,
  'icons\\apple-touch-icon.png': 180,
  'icons\\icon-192.png': 192,
  'icons\\icon-512.png': 512,
  'kessoku-moe-icon-64.png': 64, // for a quick visual sanity-check
};

for (const [name, size] of Object.entries(pngTargets)) {
  const buf = await render(size);
  await fs.writeFile(`${PUB}\\${name}`, buf);
  console.log('wrote', name, size);
}

// favicon.ico bundles 16/32/48
const ico = await pngToIco([await render(16), await render(32), await render(48)]);
await fs.writeFile(`${PUB}\\favicon.ico`, ico);
console.log('wrote favicon.ico');

await browser.close();
console.log('done');
