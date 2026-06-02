// Screenshot a local URL with installed Edge (headless) for design review.
// Usage: node scripts/shot.mjs http://localhost:3005 home
import { chromium } from 'playwright-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = process.argv[2] || 'http://localhost:3005';
const NAME = process.argv[3] || 'shot';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url) {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 200) return true;
    } catch {}
    await sleep(1000);
  }
  return false;
}

async function main() {
  // Only poll-wait for a local dev server; external URLs (embed providers) often
  // don't return 200 to a bare Node fetch, so just navigate directly.
  if (/127\.0\.0\.1|localhost/.test(URL)) {
    console.log(`waiting for ${URL} ...`);
    const up = await waitForServer(URL);
    if (!up) {
      console.log('server never came up');
      process.exit(1);
    }
    console.log('server up, capturing...');
  } else {
    console.log(`capturing external ${URL} ...`);
  }
  const browser = await chromium.launch({ headless: true, executablePath: EDGE });
  try {
    for (const vp of [
      { w: 1366, h: 850, tag: 'desktop' },
      { w: 390, h: 844, tag: 'mobile' },
    ]) {
      const ctx = await browser.newContext({
        viewport: { width: vp.w, height: vp.h },
        deviceScaleFactor: 1,
        locale: 'en-US',
      });
      const page = await ctx.newPage();
      await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(2500); // let SSR content + images begin loading
      // Trigger lazy (IntersectionObserver) images: step-scroll to the bottom, back up.
      await page.evaluate(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const step = Math.round(window.innerHeight * 0.8);
        for (let y = 0; y <= document.body.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await sleep(250);
        }
        window.scrollTo(0, 0);
        await sleep(400);
      });
      if (process.env.SCROLL_Y) {
        await page.evaluate((y) => window.scrollTo(0, y), Number(process.env.SCROLL_Y));
        await page.waitForTimeout(500);
      }
      await page.waitForTimeout(1200); // let fonts + reveal settle
      const file = `c:\\Projects\\animeflix-main\\services\\source-service\\scripts\\shot-${NAME}-${vp.tag}.png`;
      await page.screenshot({
        path: file,
        fullPage: process.env.VIEWPORT_ONLY ? false : vp.tag === 'desktop',
      });
      console.log('saved', file);
      await ctx.close();
    }
  } catch (e) {
    console.log('ERROR', e?.message || e);
  } finally {
    await browser.close();
  }
}

main();
