'use strict';

// Vendored re-implementation of the scraping surface that
// `github:riimuru/gogoanime` (gogoanime-api) used to expose. That repository
// was taken down from GitHub via DMCA, taking its whole fork network with it,
// so the original `--frozen-lockfile` install can no longer resolve it.
//
// The exported function names, parameter shapes and return shapes are kept
// identical to what packages/api/src/gogoanime.ts consumes:
//   - scrapeSearch({ keyw })        -> AnimeList[]
//   - scrapeAnimeDetails({ id })    -> { ...details, episodesList: GogoEpisode[] }
//   - scrapeMP4({ id })             -> { Referer, sources, sources_bk }
//
// GogoAnime keeps rotating/shutting down its domains, so the hosts are
// overridable through environment variables and every network path degrades
// gracefully (empty results instead of throwing) to keep the API endpoint and
// the production build healthy regardless of upstream availability.

Object.defineProperty(exports, '__esModule', { value: true });

const axios = require('axios').default || require('axios');
const cheerio = require('cheerio');
const CryptoJS = require('crypto-js');

const BASE_URL = (
  process.env.GOGOANIME_BASE_URL || 'https://anitaku.bz'
).replace(/\/+$/, '');
const AJAX_URL = (
  process.env.GOGOANIME_AJAX_URL || 'https://ajax.gogocdn.net'
).replace(/\/+$/, '');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36';

const client = axios.create({
  timeout: 15000,
  headers: { 'User-Agent': USER_AGENT },
});

// Default goload/gogocdn encryption keys. They occasionally rotate; overridable
// via env so the deployment can be patched without a code change.
const ENC_KEY = process.env.GOGOANIME_ENC_KEY || '37911490979715163134003223491201';
const ENC_IV = process.env.GOGOANIME_ENC_IV || '3134003223491201';
const ENC_SECOND_KEY =
  process.env.GOGOANIME_ENC_SECOND_KEY || '54674138327930866480207815084989';

async function scrapeSearch({ keyw, page = 1 } = {}) {
  try {
    const { data } = await client.get(
      `${BASE_URL}/search.html?keyword=${encodeURIComponent(keyw)}&page=${page}`
    );
    const $ = cheerio.load(data);
    const results = [];

    $('div.last_episodes > ul.items > li').each((_, el) => {
      const link = $(el).find('p.name > a');
      const href = link.attr('href') || '';
      const animeId = href.split('/')[2] || '';
      if (!animeId) return;
      results.push({
        animeId,
        animeTitle: link.attr('title') || link.text().trim(),
        animeUrl: `${BASE_URL}${href}`,
        animeImg: $(el).find('div.img a img').attr('src') || '',
        releasedDate: $(el).find('p.released').text().replace('Released:', '').trim(),
      });
    });

    return results;
  } catch (err) {
    return [];
  }
}

async function scrapeAnimeDetails({ id } = {}) {
  const empty = {
    animeTitle: '',
    type: '',
    releasedDate: '',
    status: '',
    genres: [],
    otherNames: '',
    synopsis: '',
    animeImg: '',
    totalEpisodes: 0,
    episodesList: [],
  };

  try {
    const { data } = await client.get(`${BASE_URL}/category/${id}`);
    const $ = cheerio.load(data);

    const info = $('div.anime_info_body_bg');
    const animeTitle = info.find('h1').text().trim();
    const animeImg = info.find('img').attr('src') || '';

    let type = '';
    let releasedDate = '';
    let status = '';
    let otherNames = '';
    const genres = [];

    info.find('p.type').each((_, el) => {
      const label = $(el).find('span').text().toLowerCase();
      if (label.includes('type')) {
        type = $(el).find('a').text().trim();
      } else if (label.includes('released')) {
        releasedDate = $(el).text().replace(/Released:/i, '').trim();
      } else if (label.includes('status')) {
        status = $(el).find('a').text().trim();
      } else if (label.includes('other name')) {
        otherNames = $(el).text().replace(/Other name:/i, '').trim();
      } else if (label.includes('genre')) {
        $(el)
          .find('a')
          .each((__, g) => genres.push($(g).attr('title') || $(g).text().trim()));
      }
    });

    const synopsis = info.find('div.description').text().trim();

    // The episode list is loaded over a separate ajax endpoint.
    const movieId = $('input#movie_id').attr('value') || '';
    const alias = $('input#alias_anime').attr('value') || '';
    const epEnd = $('#episode_page a').last().attr('ep_end') || '0';

    const episodesList = [];
    if (movieId) {
      const { data: epData } = await client.get(
        `${AJAX_URL}/ajax/load-list-episode?ep_start=0&ep_end=${epEnd}` +
          `&id=${movieId}&default_ep=0&alias=${alias}`
      );
      const $$ = cheerio.load(epData);
      $$('#episode_related > li > a').each((_, el) => {
        const href = ($$(el).attr('href') || '').trim();
        const episodeId = href.split('/')[1] || href.replace(/^\//, '');
        episodesList.push({
          episodeId,
          episodeNum: $$(el).find('div.name').text().replace('EP', '').trim(),
          episodeUrl: `${BASE_URL}${href.startsWith('/') ? href : `/${href}`}`,
        });
      });
      // The ajax endpoint returns newest-first; flip to ascending order.
      episodesList.reverse();
    }

    return {
      ...empty,
      animeTitle,
      type,
      releasedDate,
      status,
      genres,
      otherNames,
      synopsis,
      animeImg,
      totalEpisodes: episodesList.length,
      episodesList,
    };
  } catch (err) {
    return empty;
  }
}

function decrypt(value, key) {
  return CryptoJS.AES.decrypt(value, CryptoJS.enc.Utf8.parse(key), {
    iv: CryptoJS.enc.Utf8.parse(ENC_IV),
  }).toString(CryptoJS.enc.Utf8);
}

function encrypt(value, key) {
  return CryptoJS.AES.encrypt(value, CryptoJS.enc.Utf8.parse(key), {
    iv: CryptoJS.enc.Utf8.parse(ENC_IV),
  }).toString();
}

async function scrapeMP4({ id } = {}) {
  const result = { Referer: '', sources: [], sources_bk: [] };

  try {
    // 1. Episode page -> embed (goload/gogocdn) iframe url.
    const { data: epPage } = await client.get(`${BASE_URL}/${id}`);
    const $ = cheerio.load(epPage);
    let embedUrl = $('div.play-video > iframe').attr('src') || $('iframe').attr('src') || '';
    if (!embedUrl) return result;
    if (embedUrl.startsWith('//')) embedUrl = `https:${embedUrl}`;
    result.Referer = embedUrl;

    const embed = new URL(embedUrl);
    const host = `${embed.protocol}//${embed.host}`;
    const contentId = embed.searchParams.get('id') || '';

    // 2. Pull the encrypted handshake value out of the embed page.
    const { data: embedPage } = await client.get(embedUrl, {
      headers: { Referer: BASE_URL },
    });
    const $$ = cheerio.load(embedPage);
    const cryptoValue = $$("script[data-name='episode']").attr('data-value') || '';
    if (!cryptoValue) return result;

    // 3. Build the encrypt-ajax request and decrypt its response.
    const decryptedId = decrypt(cryptoValue, ENC_KEY);
    const component = encrypt(contentId, ENC_KEY);
    const ajaxParams = `id=${component}&alias=${contentId}&${decryptedId.substring(
      decryptedId.indexOf('&') + 1
    )}`;

    const { data: encrypted } = await client.get(
      `${host}/encrypt-ajax.php?${ajaxParams}`,
      { headers: { 'X-Requested-With': 'XMLHttpRequest', Referer: embedUrl } }
    );

    const decrypted = JSON.parse(decrypt(encrypted.data, ENC_SECOND_KEY) || '{}');
    result.sources = Array.isArray(decrypted.source) ? decrypted.source : [];
    result.sources_bk = Array.isArray(decrypted.source_bk) ? decrypted.source_bk : [];

    return result;
  } catch (err) {
    return result;
  }
}

exports.scrapeSearch = scrapeSearch;
exports.scrapeAnimeDetails = scrapeAnimeDetails;
exports.scrapeMP4 = scrapeMP4;
