import { inflateRawSync } from 'node:zlib';

// Minimal ZIP reader — enough for subdl's single-file subtitle archives, with
// zero dependencies. Walks the central directory and inflates each entry
// (stored = method 0, deflate = method 8). Anything exotic is skipped, never
// thrown. Returns { filename: Buffer }.
export function unzip(buf: Buffer): Record<string, Buffer> {
  const out: Record<string, Buffer> = {};

  // Find the End Of Central Directory record (signature 0x06054b50), scanning
  // back from the end past any trailing comment.
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) return out;

  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16); // central directory offset

  for (let i = 0; i < count; i += 1) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);

    // The local header repeats name/extra lengths; the data starts after them.
    const lhNameLen = buf.readUInt16LE(localOff + 26);
    const lhExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lhNameLen + lhExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);

    try {
      out[name] = method === 0 ? Buffer.from(raw) : inflateRawSync(raw);
    } catch {
      // skip unreadable entry
    }

    off += 46 + nameLen + extraLen + commentLen;
  }

  return out;
}
