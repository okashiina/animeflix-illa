// Convert SRT and ASS/SSA subtitles to WebVTT, which is what our player consumes.
// SRT→VTT is lossless; ASS→VTT keeps dialogue and drops styling/positioning
// (acceptable — the player applies its own caption styling).

/** "0:00:05.43" (ASS, centiseconds) -> "00:00:05.430" (VTT, milliseconds). */
function assTime(t: string): string {
  const m = /(\d+):(\d{2}):(\d{2})[.,](\d{1,3})/.exec(t.trim());
  if (!m) return '00:00:00.000';
  const h = m[1].padStart(2, '0');
  const ms = m[4].padEnd(3, '0').slice(0, 3);
  return `${h}:${m[2]}:${m[3]}.${ms}`;
}

export function srtToVtt(srt: string): string {
  const body = srt
    .replace(/^﻿/, '')
    .replace(/\r+/g, '')
    // SRT uses a comma before the milliseconds; VTT uses a dot.
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    // Some SRTs smuggle in ASS positioning tags (e.g. {\an8}) — strip them so
    // they don't render as literal text.
    .replace(/\{\\[^}]*\}/g, '')
    .trim();
  return `WEBVTT\n\n${body}\n`;
}

export function assToVtt(ass: string): string {
  const lines = ass.replace(/\r+/g, '').split('\n');
  const out: string[] = ['WEBVTT', ''];
  let inEvents = false;
  let cols: { start: number; end: number; text: number } | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (/^\[.+\]$/.test(line)) {
      inEvents = /^\[Events\]/i.test(line);
      continue;
    }
    if (!inEvents) continue;

    if (/^Format:/i.test(line)) {
      const names = line
        .slice(line.indexOf(':') + 1)
        .split(',')
        .map((s) => s.trim().toLowerCase());
      cols = {
        start: names.indexOf('start'),
        end: names.indexOf('end'),
        text: names.indexOf('text'),
      };
      continue;
    }

    if (/^Dialogue:/i.test(line) && cols && cols.text >= 0) {
      const fields = line.slice(line.indexOf(':') + 1).split(',');
      const start = fields[cols.start];
      const end = fields[cols.end];
      // Text is the last field and may itself contain commas — rejoin them.
      const text = fields.slice(cols.text).join(',');
      const cleaned = text
        .replace(/\{[^}]*\}/g, '') // ASS override tags {\pos...}, {\i1}, etc.
        .replace(/\\N/gi, '\n') // hard line break
        .replace(/\\h/gi, ' ') // hard space
        .trim();
      if (!start || !end || !cleaned) continue;
      out.push(`${assTime(start)} --> ${assTime(end)}`);
      out.push(cleaned);
      out.push('');
    }
  }

  return out.join('\n');
}

/** Pick a converter by extension/content and return WebVTT. */
export function toVtt(text: string, hint: string): string {
  if (/^WEBVTT/.test(text)) return text;
  if (/\.(ass|ssa)$/i.test(hint) || /^\[Script Info\]/m.test(text)) {
    return assToVtt(text);
  }
  return srtToVtt(text);
}
