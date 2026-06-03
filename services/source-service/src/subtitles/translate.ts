import { config } from '../config.js';

// Machine-translate a WebVTT track while preserving every timestamp exactly.
// We translate the Japanese (Jimaku) track — which is timed to the same broadcast
// cut AnimePahe streams — into Indonesian. The result therefore inherits perfect
// timing, which subdl's Crunchyroll-timed files cannot match (they drift tens of
// seconds vs the AnimePahe encode). Quality is machine-grade and labelled "(auto)".
//
// Engine: the keyless Google endpoint. No API key, and results are cached per
// episode in subtitles/index.ts, so a given episode is translated exactly once.

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';

/** Translate one blob of text. Returns null on any failure (caller degrades). */
async function gtx(text: string, from: string, to: string): Promise<string | null> {
  const url =
    `${ENDPOINT}?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': config.userAgent } });
    if (!res.ok) return null;
    // Shape: [ [ [translated, original, ...], ... ], ... ]. Concatenating every
    // segment's first element reproduces the full text, newlines included.
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
    return (data[0] as unknown[])
      .map((seg) => (Array.isArray(seg) ? String(seg[0] ?? '') : ''))
      .join('');
  } catch {
    return null;
  }
}

interface Block {
  head: string; // cue id (optional) + the "-->" timing line, kept verbatim
  text: string | null; // spoken text to translate; null for WEBVTT/NOTE/STYLE blocks
}

function parseBlocks(vtt: string): Block[] {
  return vtt
    .replace(/\r/g, '')
    .split(/\n\n+/)
    .map((chunk) => {
      const lines = chunk.split('\n');
      const tsIdx = lines.findIndex((l) => l.includes('-->'));
      if (tsIdx === -1) return { head: chunk, text: null };
      const head = lines.slice(0, tsIdx + 1).join('\n');
      const text = lines.slice(tsIdx + 1).join('\n').trim();
      return { head, text: text || null };
    });
}

/**
 * Translate cue texts in batches under a char budget (one request per batch),
 * with a per-cue fallback when the engine doesn't preserve the line count.
 */
async function translateAll(
  texts: string[],
  from: string,
  to: string
): Promise<string[]> {
  const BUDGET = 1200; // chars/request — keeps the GET URL well under limits
  const batches: number[][] = [];
  let cur: number[] = [];
  let curLen = 0;
  texts.forEach((t, i) => {
    const len = t.length + 1;
    if (cur.length && curLen + len > BUDGET) {
      batches.push(cur);
      cur = [];
      curLen = 0;
    }
    cur.push(i);
    curLen += len;
  });
  if (cur.length) batches.push(cur);

  const out: string[] = new Array(texts.length).fill('');
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < batches.length) {
      const batch = batches[next];
      next += 1;
      const joined = batch.map((i) => texts[i]).join('\n');
      const res = await gtx(joined, from, to);
      const parts = res ? res.split('\n') : [];
      if (parts.length === batch.length) {
        batch.forEach((i, k) => {
          out[i] = parts[k].trim();
        });
      } else {
        // Line count drifted — translate each cue on its own to stay aligned.
        for (const i of batch) {
          // eslint-disable-next-line no-await-in-loop
          const one = await gtx(texts[i], from, to);
          out[i] = (one ?? texts[i]).trim();
        }
      }
    }
  };

  const CONCURRENCY = 4;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker)
  );
  return out;
}

/** Translate a full WebVTT document, keeping timings byte-for-byte. */
export async function translateVtt(
  vtt: string,
  from: string,
  to: string
): Promise<string | null> {
  const blocks = parseBlocks(vtt);
  const idxs = blocks.flatMap((b, i) => (b.text ? [i] : []));
  if (!idxs.length) return null;

  // Captions are short; collapse internal breaks so each cue stays one segment.
  const texts = idxs.map((i) => blocks[i].text!.replace(/\n/g, ' '));
  const translated = await translateAll(texts, from, to);

  // If nothing came back, the engine failed — don't serve an untranslated copy.
  if (translated.every((t) => !t)) return null;

  idxs.forEach((bi, k) => {
    if (translated[k]) blocks[bi].text = translated[k];
  });

  return blocks
    .map((b) => (b.text != null ? `${b.head}\n${b.text}` : b.head))
    .join('\n\n');
}
