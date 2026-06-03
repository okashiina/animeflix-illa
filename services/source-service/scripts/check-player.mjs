// Verify the watch page actually plays our self-hosted stream in a real browser:
// loads the page, waits for the source-service resolve + hls.js, then inspects the
// <video> element (readyState/buffered = segments loaded through our /hls proxy).
import { chromium } from 'playwright-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = process.argv[2] || 'http://127.0.0.1:3005/watch/21?episode=1';
const WAIT = Number(process.argv[3] || 32000);

const browser = await chromium.launch({ headless: !process.env.HEADED, executablePath: EDGE });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 }, locale: 'en-US' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 120));
});

console.log(`loading ${URL} (waiting ${WAIT}ms for resolve + hls)...`);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(WAIT);

const info = await page.evaluate(() => {
  const v = document.querySelector('video');
  const iframe = document.querySelector('iframe');
  const badge = [...document.querySelectorAll('button, span')].some((e) =>
    /our server/i.test(e.textContent || '')
  );
  return {
    hasVideo: !!v,
    hasIframe: !!iframe,
    ourServerBadge: badge,
    readyState: v ? v.readyState : null,
    networkState: v ? v.networkState : null,
    bufferedSec: v && v.buffered.length ? Math.round(v.buffered.end(0) * 100) / 100 : 0,
    duration: v ? Math.round(v.duration || 0) : null,
    videoWidth: v ? v.videoWidth : null,
    errorCode: v && v.error ? v.error.code : null,
    currentSrc: v ? (v.currentSrc || '').slice(0, 90) : null,
  };
});
console.log(JSON.stringify(info, null, 2));
console.log('console errors:', errors.slice(0, 6));
await page.screenshot({ path: 'c:\\Projects\\animeflix-main\\services\\source-service\\scripts\\shot-player.png' });
console.log('saved shot-player.png');
await browser.close();
