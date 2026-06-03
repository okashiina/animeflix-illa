// Research probe: Jimaku.cc — anime subtitle repository keyed by AniList id.
//
// What this proves:
//   * Jimaku's API is AniList-id native — exactly our primary identifier.
//   * Every endpoint requires an API key (Authorization: <key>), obtained free
//     from https://jimaku.cc/account after signing in.
//   * We probe a known anime (Frieren, AniList 154587) to list its subtitle
//     files and report the LANGUAGES + FORMATS actually present.
//
// Run:
//   JIMAKU_KEY=xxxxx node scripts/research-subs-jimaku.mjs
//   node scripts/research-subs-jimaku.mjs            (no key -> shows the 401)
//
// Without a key the probe still demonstrates the auth wall and prints what it
// WOULD request, so the finding is evidence-backed either way.

const KEY = process.env.JIMAKU_KEY || '';
const BASE = 'https://jimaku.cc/api';

// Sousou no Frieren — popular, well-subbed, stable AniList id.
const ANILIST_ID = Number(process.env.ANILIST_ID || 154587);

const headers = KEY ? { Authorization: KEY } : {};

async function getJson(url) {
  const r = await fetch(url, { headers });
  const text = await r.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 300);
  }
  return { status: r.status, body };
}

function langsFromFiles(files) {
  // Jimaku does not tag language per file; the convention is to infer from the
  // filename (e.g. ".id.srt", ".eng.ass", "[Indonesian]"). We bucket by suffix.
  const buckets = {};
  const fmt = {};
  for (const f of files) {
    const name = (f.name || '').toLowerCase();
    const ext = name.split('.').pop();
    fmt[ext] = (fmt[ext] || 0) + 1;
    const m = name.match(
      /\.(id|ind|indo|indonesia|en|eng|english|ja|jpn|japanese|ar|es|pt|th|vi|zh)\b/
    );
    const tag = m ? m[1] : 'untagged';
    buckets[tag] = (buckets[tag] || 0) + 1;
  }
  return { buckets, fmt };
}

(async () => {
  console.log(`# Jimaku probe — AniList id ${ANILIST_ID}`);
  console.log(`# key present: ${KEY ? 'yes' : 'NO (expect 401)'}\n`);

  // 1) Resolve the AniList id -> a Jimaku entry.
  const searchUrl = `${BASE}/entries/search?anilist_id=${ANILIST_ID}`;
  console.log(`GET ${searchUrl}`);
  const search = await getJson(searchUrl);
  console.log(`  -> ${search.status}`);
  if (search.status === 401) {
    console.log(
      '  AUTH WALL: Jimaku requires an API key for every endpoint, including search.'
    );
    console.log(
      '  Get a free key at https://jimaku.cc/account (sign in with Discord), then re-run with JIMAKU_KEY=...'
    );
    console.log(
      '\n  WHAT THE PROBE WOULD DO WITH A KEY:\n' +
        '   1. /entries/search?anilist_id=ID  -> entry objects { id, name, english_name, ... }\n' +
        '   2. /entries/{entryId}/files       -> [{ name, url, size, last_modified }]\n' +
        '   3. bucket file names by language suffix + extension (srt/ass) to report coverage.'
    );
    return;
  }
  if (!Array.isArray(search.body) || search.body.length === 0) {
    console.log('  No Jimaku entry for this AniList id.', search.body);
    return;
  }
  for (const entry of search.body) {
    console.log(
      `  entry ${entry.id}: ${entry.english_name || entry.name} (flags: ${JSON.stringify(entry.flags || {})})`
    );
  }

  // 2) List files for the first entry and report languages/formats.
  const entryId = search.body[0].id;
  const filesUrl = `${BASE}/entries/${entryId}/files`;
  console.log(`\nGET ${filesUrl}`);
  const files = await getJson(filesUrl);
  console.log(`  -> ${files.status}`);
  if (!Array.isArray(files.body)) {
    console.log('  unexpected:', files.body);
    return;
  }
  console.log(`  ${files.body.length} files`);
  const { buckets, fmt } = langsFromFiles(files.body);
  console.log('  format counts:', fmt);
  console.log('  language-tag counts (inferred from filename):', buckets);
  console.log(
    `  Indonesian present: ${buckets.id || buckets.ind || buckets.indo ? 'YES' : 'no obvious .id/.ind-tagged files'}`
  );
  console.log('\n  sample filenames:');
  for (const f of files.body.slice(0, 12)) console.log('   -', f.name);
})().catch((e) => console.error('FATAL', e));
