// Verify the new SourcePlayer UI + the bidirectional embed<->our-player switch
// (DOM presence only; doesn't need H.264 decode which automated browsers lack).
import { chromium } from 'playwright-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = process.argv[2] || 'http://127.0.0.1:3005/watch/21?episode=2';

const browser = await chromium.launch({ headless: true, executablePath: EDGE });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const r = {};
try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // wait for our player (resolve can take ~16s; ep2 is cached so usually fast)
  try {
    await page.waitForSelector('video', { timeout: 40000 });
    r.directVideo = true;
  } catch {
    r.directVideo = false;
  }
  r.ourPlayerBadge = (await page.locator('text=our player').count()) > 0;
  r.quality1080 = (await page.getByRole('button', { name: '1080p' }).count()) > 0;
  r.quality720 = (await page.getByRole('button', { name: '720p' }).count()) > 0;

  // direct -> embed
  const toEmbed = page.getByRole('button', { name: 'Use embed instead' });
  if (await toEmbed.count()) {
    await toEmbed.first().click();
    await page.waitForTimeout(3500);
  }
  r.iframeAfterToEmbed = (await page.locator('iframe').count()) > 0;

  // embed -> back to our player (the bug that was one-way)
  const back = page.getByRole('button', { name: /Switch to our player/ });
  r.switchBackButton = (await back.count()) > 0;
  if (await back.count()) {
    await back.first().click();
    await page.waitForTimeout(3500);
    r.videoAfterSwitchBack = (await page.locator('video').count()) > 0;
  }
} catch (e) {
  r.error = e?.message || String(e);
}
console.log(JSON.stringify(r, null, 2));
await browser.close();
