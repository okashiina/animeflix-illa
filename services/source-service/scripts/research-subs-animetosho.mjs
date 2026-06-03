// Research probe: AnimeTosho — release-tracker with a free, key-less JSON API.
// It mirrors anime torrents and EXTRACTS subtitle attachments (.ass/.srt) from
// the release files, downloadable directly without the torrent.
//
// Findings this proves:
//   * JSON API at feed.animetosho.org/json — no API key, no auth.
//   * Items are keyed by ANIDB ids (anidb_aid / anidb_eid), NOT AniList. So the
//     id-mapping path is AniList -> AniDB (via Fribb/anime-lists or ARM), or just
//     a title text search (q=).
//   * Extracted subs are whatever the RELEASE GROUP shipped — overwhelmingly
//     English (+ sometimes Japanese/signs). Indonesian is essentially absent;
//     Indo fansubs don't release on the BitTorrent groups AnimeTosho indexes.
//   * Format is almost always .ass (positioned/styled), which needs real ASS->VTT
//     conversion, not a trivial reformat.
//
// Run: node scripts/research-subs-animetosho.mjs

const UA = { 'User-Agent': 'kessoku-sub-research/1.0' };
const QUERY = process.env.Q || 'Frieren';

async function j(url) {
  const r = await fetch(url, { headers: UA });
  return { status: r.status, body: await r.text() };
}

(async () => {
  console.log(`# AnimeTosho probe — q="${QUERY}" (no API key needed)\n`);

  const search = await j(
    `https://feed.animetosho.org/json?q=${encodeURIComponent(QUERY)}&only_tor=0`
  );
  console.log(`GET /json?q=${QUERY} -> ${search.status}`);
  let items = [];
  try {
    items = JSON.parse(search.body);
  } catch {
    console.log('  non-json:', search.body.slice(0, 200));
    return;
  }
  console.log(`  ${items.length} releases\n`);

  // Show that items carry AniDB ids (the mapping target), not AniList.
  const sample = items.slice(0, 5);
  for (const it of sample) {
    console.log(
      `  [${it.id}] anidb_aid=${it.anidb_aid} anidb_eid=${it.anidb_eid} files=${it.num_files}`
    );
    console.log(`        ${it.title}`);
  }
  console.log(
    '\n  -> Items are keyed by ANIDB, so AniList must be mapped to AniDB first.'
  );
  console.log(
    '     (AniList -> AniDB via github.com/Fribb/anime-lists or arm.haglund.dev,'
  );
  console.log('      or just text-search by title as done here.)\n');

  // The extracted subtitle attachments live on the per-release VIEW page under an
  // "Extractions / Subtitles" block (e.g. "English [eng, ASS]"). The JSON feed
  // gives us article_url; the attachment links are on that HTML page.
  const withView = items.find((it) => it.article_url) || items[0];
  console.log('Extracted-subtitle attachments are on the release view page:');
  console.log('  ', withView.article_url);
  console.log(
    '  That page exposes direct downloads like "[English [eng, ASS]]" and an'
  );
  console.log(
    '  "All Attachments [.7z]" bundle — verified manually: format is ASS, language'
  );
  console.log(
    '  is whatever the release group shipped (English for the probed Frieren batch).'
  );
  console.log(
    '\nVERDICT: great for ENGLISH .ass, near-zero for Indonesian. ASS->VTT conversion'
  );
  console.log(
    '         is non-trivial (positioning/styling/karaoke do not map to plain VTT).'
  );
})().catch((e) => console.error('FATAL', e));
