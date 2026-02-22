import { phonemize } from 'phonemizer';

// ── Text Processing ───────────────────────────────────────────────────────────
const _pad = "$";
const _punctuation = ';:,.!?¡¿—…"«»"" ';
const _letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const _letters_ipa = "ɑɐɒæɓʙβɔɕçɗɖðʤəɘɚɛɜɝɞɟʄɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɱɯɰŋɳɲɴøɵɸθœɶʘɹɺɾɻʀʁɽʂʃʈʧʉʊʋⱱʌɣɤʍχʎʏʑʐʒʔʡʕʢǀǁǂǃˈˌːˑʼʴʰʱʲʷˠˤ˞↓↑→↗↘'̩'ᵻ";
const symbols = [_pad, ...Array.from(_punctuation), ...Array.from(_letters), ...Array.from(_letters_ipa)];

const wordIndexDictionary = {};
for (let i = 0; i < symbols.length; i++) {
  wordIndexDictionary[symbols[i]] = i;
}

export function cleanText(text) {
  const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]/gu;
  return text
    .replace(emojiRegex, '')
    .replace(/\b\/\b/, ' slash ')
    .replace(/[\/\\()¯]/g, '')
    .replace(/["""]/g, '')
    .replace(/\s—/g, '.')
    .replace(/[^\u0000-\u024F]/g, '')
    .trim();
}

export function tokenizePhonemes(text) {
  const indexes = [];
  for (const char of text) {
    if (wordIndexDictionary[char] !== undefined) {
      indexes.push(wordIndexDictionary[char]);
    }
  }
  return indexes;
}

export async function processText(text) {
  text = cleanText(text);
  const phonemes = (await phonemize(text)).join('');
  const tokens = tokenizePhonemes(phonemes);
  tokens.unshift(0);
  tokens.push(0);
  return tokens;
}

// ── NPZ / NPY Parsing ─────────────────────────────────────────────────────────
// .npz is a ZIP archive of .npy files. .npy is a simple binary format for numpy arrays.

async function inflate(data) {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  await writer.write(data);
  await writer.close();
  const chunks = [];
  const reader = ds.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) { out.set(c, pos); pos += c.length; }
  return out.buffer;
}

export async function parseNpz(buffer) {
  const data = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const entries = {};
  let offset = 0;

  while (offset + 30 < data.length) {
    if (view.getUint32(offset, true) !== 0x04034b50) break; // local file header signature

    const compression    = view.getUint16(offset + 8,  true);
    let   compressedSize = view.getUint32(offset + 18, true);
    const origSizeSentinel = view.getUint32(offset + 22, true) === 0xFFFFFFFF;
    const filenameLen    = view.getUint16(offset + 26, true);
    const extraLen       = view.getUint16(offset + 28, true);

    const filenameStart = offset + 30;
    const filename = new TextDecoder().decode(data.slice(filenameStart, filenameStart + filenameLen));
    const extraStart = filenameStart + filenameLen;
    const dataStart  = extraStart + extraLen;

    // ZIP64: 0xFFFFFFFF sentinel means the real size is in the extra field (ID 0x0001).
    // The ZIP64 extra block contains: [originalSize uint64][compressedSize uint64],
    // but only the fields whose local-header slot held 0xFFFFFFFF are present.
    if (compressedSize === 0xFFFFFFFF) {
      let ep = extraStart;
      while (ep + 4 <= dataStart) {
        const eid   = view.getUint16(ep,     true);
        const esize = view.getUint16(ep + 2, true);
        if (eid === 0x0001) {
          // If original-size was also a sentinel it comes first, then compressed-size.
          const compFieldOffset = ep + 4 + (origSizeSentinel ? 8 : 0);
          compressedSize = Number(view.getBigUint64(compFieldOffset, true));
          break;
        }
        ep += 4 + esize;
      }
    }

    const compressedData = data.slice(dataStart, dataStart + compressedSize);
    const key = filename.replace(/\.npy$/, '');
    if (compression === 0) {
      entries[key] = compressedData.buffer;        // STORED — no decompression needed
    } else if (compression === 8) {
      entries[key] = await inflate(compressedData); // DEFLATED
    }

    offset = dataStart + compressedSize;
  }

  return entries;
}

export function parseNpy(buffer) {
  const view = new DataView(buffer);
  const headerLen = view.getUint16(8, true);
  const headerStr = new TextDecoder().decode(new Uint8Array(buffer, 10, headerLen));

  const shapeMatch = headerStr.match(/'shape':\s*\(([^)]*)\)/);
  const shape = shapeMatch[1].split(',').map(s => s.trim()).filter(Boolean).map(Number);

  const dataOffset = 10 + headerLen;
  const totalElements = shape.reduce((a, b) => a * b, 1);
  return { data: new Float32Array(buffer.slice(dataOffset), 0, totalElements), shape };
}

// ── Model Download ────────────────────────────────────────────────────────────
export async function downloadWithProgress(url, onProgress) {
  // Use full URL as cache key (sanitized) so files with the same name from different
  // repos (e.g. voices.npz for nano vs mini) don't collide in OPFS.
  const cacheKey = url.replace(/https?:\/\//, '').replace(/[^a-z0-9._-]/gi, '_');

  // Return from OPFS cache if available
  try {
    const opfsRoot = await navigator.storage.getDirectory();
    const fileHandle = await opfsRoot.getFileHandle(cacheKey, { create: false });
    const file = await fileHandle.getFile();
    return await file.arrayBuffer();
  } catch { /* not cached yet */ }

  // Download with progress
  const response = await fetch(url);
  const total = parseInt(response.headers.get('content-length'), 10);
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.(loaded, total);
  }

  const data = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }

  // Write to OPFS cache
  try {
    const opfsRoot = await navigator.storage.getDirectory();
    const fileHandle = await opfsRoot.getFileHandle(cacheKey, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
  } catch (e) {
    console.warn('OPFS cache write failed:', e);
  }

  return data.buffer;
}

// ── Audio Processing ──────────────────────────────────────────────────────────
export function createWavBuffer(audioData, sampleRate = 24000) {
  const buffer = new ArrayBuffer(44 + audioData.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + audioData.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, audioData.length * 2, true);

  let offset = 44;
  for (let i = 0; i < audioData.length; i++) {
    const sample = Math.max(-1, Math.min(1, audioData[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    offset += 2;
  }

  return buffer;
}
