// Option-B PoC: can we resolve real m3u8 + subtitle tracks from HiAnime via the
// maintained `aniwatch` scraper, FROM THIS LAPTOP's residential IP, with NO
// Docker / FlareSolverr? If this prints an m3u8, the self-hosted pipeline is
// viable on the laptop for testing.
//
// Usage: node scripts/test-hianime.mjs "One Piece" 1 sub
import { HiAnime } from 'aniwatch';

const QUERY = process.argv[2] || 'One Piece';
const EP = parseInt(process.argv[3] || '1', 10);
const CATEGORY = process.argv[4] || 'sub';

const hianime = new HiAnime.Scraper();
const head = (s, n = 100) => String(s ?? '').slice(0, n);

async function main() {
  console.log(`\n=== HiAnime PoC ===  query="${QUERY}" ep=${EP} cat=${CATEGORY}\n`);
  try {
    const search = await hianime.search(QUERY);
    const animes = search?.animes || [];
    console.log(`[search] ${animes.length} results`);
    animes.slice(0, 6).forEach((a) =>
      console.log(`   ${a.id}  "${a.name}"  sub=${a.episodes?.sub} dub=${a.episodes?.dub} type=${a.type}`)
    );
    if (!animes.length) {
      console.log('\nRESULT: no search results (blocked?).');
      return;
    }
    const anime = animes[0];
    console.log(`\n[using] ${anime.id}  "${anime.name}"`);

    const epData = await hianime.getEpisodes(anime.id);
    const episodes = epData?.episodes || [];
    console.log(`[episodes] total=${episodes.length}`);
    const target =
      episodes.find((e) => e.number === EP) || episodes[EP - 1] || episodes[0];
    if (!target) {
      console.log('\nRESULT: no episodes.');
      return;
    }
    console.log(`   -> episodeId=${target.episodeId}  number=${target.number}`);

    try {
      const servers = await hianime.getEpisodeServers(target.episodeId);
      console.log(
        `[servers] sub=${JSON.stringify((servers?.sub || []).map((s) => s.serverName))} dub=${JSON.stringify((servers?.dub || []).map((s) => s.serverName))}`
      );
    } catch (e) {
      console.log('[servers] err:', e?.message || e);
    }

    const sources = await hianime.getEpisodeSources(target.episodeId, 'hd-1', CATEGORY);
    console.log(`\n[sources] ${sources?.sources?.length || 0} source(s):`);
    (sources?.sources || []).forEach((s) => console.log(`   ${s.type || ''}  ${s.url}`));
    console.log(`[subtitle/thumb tracks] ${sources?.tracks?.length || 0}:`);
    (sources?.tracks || []).forEach((t) => console.log(`   lang=${t.lang || t.label}  ${head(t.url, 90)}`));
    console.log(`[intro] ${JSON.stringify(sources?.intro)}  [outro] ${JSON.stringify(sources?.outro)}`);
    console.log(
      `\n=== RESULT: ${sources?.sources?.length ? 'SUCCESS — got playable m3u8' : 'NO SOURCES'} ===\n`
    );
  } catch (e) {
    console.log('\nERROR:', e?.message || e);
    if (/403|cloudflare|forbidden|just a moment/i.test(String(e)))
      console.log('-> looks Cloudflare/anti-bot blocked from this IP.');
  }
}

main();
