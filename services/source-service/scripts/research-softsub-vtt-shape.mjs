// Soft-sub research probe — verify the VTT track shape end-to-end.
//
// PURPOSE: prove the contract from extractor -> our player. HiAnime (via `aniwatch`)
// returns sources.subtitles[] = [{ url, lang }] pointing at WebVTT files on
// s.megastatics.com. Our HlsPlayer `subtitles` prop wants { url, lang, label? }
// and types.ts `Subtitle` = { url, lang, label? }. This script:
//   1. (optional) given a real VTT url, fetches it and confirms it's valid WEBVTT
//      and counts cues — so we KNOW the bytes our <track> will consume are good.
//   2. shows the exact mapping aniwatch.subtitles[] -> our Subtitle[] (the glue
//      the new provider needs).
//
// From this residential laptop the HiAnime PAGE hosts are blocked/522, but the
// subtitle CDN s.megastatics.com is reachable (HTTP 200) — so VTT proxying works
// here even when extraction must run on a VPS. Pass a real url to test live:
//   node scripts/research-softsub-vtt-shape.mjs "https://s.megastatics.com/subtitle/<hash>/eng-2.vtt"

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const vttUrl = process.argv[2];

// HiAnime lang labels are full words ("English", "Spanish"); our Subtitle.lang is an
// ISO code. Map common ones and fall back to the raw lang as both code+label.
const LANG_TO_ISO = {
  english: 'en',
  spanish: 'es',
  'spanish - latin america': 'es-419',
  portuguese: 'pt',
  'portuguese - brazil': 'pt-BR',
  french: 'fr',
  german: 'de',
  italian: 'it',
  arabic: 'ar',
  indonesian: 'id',
  thai: 'th',
};

// aniwatch.subtitles[] -> our types.ts Subtitle[] ({ url, lang, label? }).
// HiAnime also includes a "thumbnails" track (lang === 'thumbnails') — drop it.
function toPlayerSubtitles(aniwatchSubtitles) {
  return (aniwatchSubtitles || [])
    .filter((s) => s.url && s.lang && !/thumbnail/i.test(s.lang))
    .map((s) => {
      const key = String(s.lang).toLowerCase();
      return { url: s.url, lang: LANG_TO_ISO[key] || key.slice(0, 2), label: s.lang };
    });
}

function summarizeVtt(text) {
  const isVtt = /^﻿?WEBVTT/.test(text);
  const cues = (text.match(/-->/g) || []).length;
  return { isVtt, cues, bytes: text.length };
}

async function main() {
  console.log('\n=== VTT shape / mapping verification ===\n');

  // Show the mapping with a representative aniwatch payload (real field names).
  const sample = [
    { url: 'https://s.megastatics.com/subtitle/HASH/eng-2.vtt', lang: 'English' },
    { url: 'https://s.megastatics.com/subtitle/HASH/spa-3.vtt', lang: 'Spanish - Latin America' },
    { url: 'https://s.megastatics.com/subtitle/HASH/thumbnails/thumb.vtt', lang: 'thumbnails' },
  ];
  console.log('aniwatch getEpisodeSources().subtitles[]  (sample shape):');
  sample.forEach((s) => console.log(`   { lang: ${JSON.stringify(s.lang)}, url: ${s.url} }`));
  console.log('\n-> mapped to our HlsPlayer `subtitles` prop (types.ts Subtitle[]):');
  toPlayerSubtitles(sample).forEach((s) => console.log(`   ${JSON.stringify(s)}`));

  if (!vttUrl) {
    console.log('\n(no VTT url passed — pass a real s.megastatics.com .vtt to fetch+validate it)');
    return;
  }

  console.log(`\n--- fetching live VTT: ${vttUrl}`);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(vttUrl, {
      headers: { 'User-Agent': UA, Referer: 'https://megacloud.blog/' },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const text = await res.text();
    const sum = summarizeVtt(text);
    console.log(`  HTTP ${res.status}  content-type=${res.headers.get('content-type')}`);
    console.log(`  valid WEBVTT=${sum.isVtt}  cues=${sum.cues}  bytes=${sum.bytes}`);
    console.log(`  head: ${JSON.stringify(text.slice(0, 80))}`);
    console.log(
      `\n=== RESULT: ${sum.isVtt && sum.cues > 0 ? 'VALID softsub VTT — ready for <track src=...>' : 'NOT a usable VTT'} ===`
    );
  } catch (e) {
    clearTimeout(t);
    console.log(`  FETCH FAILED: ${e.name} ${e.message}`);
  }
}

main();
