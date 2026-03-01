import ort from 'onnxruntime-node';
import fs from 'fs';
import { inflateRawSync } from 'zlib';
const { phonemize } = await import('phonemizer');

// ── Text Processing ───────────────────────────────────────────────────────────
const _pad = "$";
const _punctuation = ';:,.!?¡¿—…"«»"" ';
const _letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const _letters_ipa = "ɑɐɒæɓʙβɔɕçɗɖðʤəɘɚɛɜɝɞɟʄɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɱɯɰŋɳɲɴøɵɸθœɶʘɹɺɾɻʀʁɽʂʃʈʧʉʊʋⱱʌɣɤʍχʎʏʑʐʒʔʡʕʢǀǁǂǃˈˌːˑʼʴʰʱʲʷˠˤ˞↓↑→↗↘'̩'ᵻ";
const symbols = [_pad, ...Array.from(_punctuation), ...Array.from(_letters), ...Array.from(_letters_ipa)];

const wordIndexDictionary = {};
for (let i = 0; i < symbols.length; i++) wordIndexDictionary[symbols[i]] = i;

function tokenizePhonemes(text) {
  const indexes = [];
  for (const char of text) {
    if (wordIndexDictionary[char] !== undefined) indexes.push(wordIndexDictionary[char]);
  }
  return indexes;
}

// ── NPZ / NPY Parsing (Node.js) ───────────────────────────────────────────────
function parseNpz(nodeBuffer) {
  const data = nodeBuffer;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const entries = {};
  let offset = 0;

  while (offset + 30 < data.length) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;

    const compression      = view.getUint16(offset + 8,  true);
    let   compressedSize   = view.getUint32(offset + 18, true);
    const origSizeSentinel = view.getUint32(offset + 22, true) === 0xFFFFFFFF;
    const filenameLen      = view.getUint16(offset + 26, true);
    const extraLen         = view.getUint16(offset + 28, true);

    const filenameStart = offset + 30;
    const filename   = data.slice(filenameStart, filenameStart + filenameLen).toString('utf8');
    const extraStart = filenameStart + filenameLen;
    const dataStart  = extraStart + extraLen;

    if (compressedSize === 0xFFFFFFFF) {
      let ep = extraStart;
      while (ep + 4 <= dataStart) {
        const eid   = view.getUint16(ep,     true);
        const esize = view.getUint16(ep + 2, true);
        if (eid === 0x0001) {
          const compFieldOffset = ep + 4 + (origSizeSentinel ? 8 : 0);
          compressedSize = Number(view.getBigUint64(compFieldOffset, true));
          break;
        }
        ep += 4 + esize;
      }
    }

    const compressedData = data.slice(dataStart, dataStart + compressedSize);
    const key = filename.replace(/\.npy$/, '');
    const raw = compression === 8 ? inflateRawSync(compressedData) : compressedData;
    entries[key] = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);

    offset = dataStart + compressedSize;
  }

  return entries;
}

function ensurePunctuation(text) {
  text = text.trim();
  if (!text) {
      return text;
  }
  if (!['.', '!', '?', ',', ';', ':'].includes(text.slice(-1))) {
      text = text + ',';
  }
  return text;
}

function parseNpy(buffer) {
  const view = new DataView(buffer);
  const headerLen = view.getUint16(8, true);
  const headerStr = new TextDecoder().decode(new Uint8Array(buffer, 10, headerLen));
  const shape = headerStr.match(/'shape':\s*\(([^)]*)\)/)[1]
    .split(',').map(s => s.trim()).filter(Boolean).map(Number);
  const dataOffset = 10 + headerLen;
  const totalElements = shape.reduce((a, b) => a * b, 1);
  return { data: new Float32Array(buffer.slice(dataOffset), 0, totalElements), shape };
}

// ── Audio ─────────────────────────────────────────────────────────────────────
function createWavBuffer(audioData, sampleRate = 24000) {
  const buffer = new ArrayBuffer(44 + audioData.length * 2);
  const view = new DataView(buffer);
  const str = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); view.setUint32(4, 36 + audioData.length * 2, true);
  str(8, 'WAVE'); str(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, audioData.length * 2, true);
  let off = 44;
  for (let i = 0; i < audioData.length; i++) {
    const s = Math.max(-1, Math.min(1, audioData[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    off += 2;
  }
  return buffer;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const MODEL_PATH = "tests/models/kitten_tts_nano_v0_8.onnx";
const VOICES_PATH = "tests/models/voices_nano.npz";

async function main(text, voice = "expr-voice-2-f", speed = 1) {
  let start;

  console.log("Phonemizing");
  let phonemes = (await phonemize(text)).join('');
  // Sounds weird otherwise
  phonemes = ensurePunctuation(phonemes)

  console.log("Tokenizing");
  // phonemizer is browser-only; use the raw text as a stand-in for quick tests
  const tokens = [0, ...tokenizePhonemes(phonemes), 0];
  console.log(`  ${tokens.length} tokens`);

  console.log("Parsing voices NPZ");
  start = performance.now();
  const entries = parseNpz(fs.readFileSync(VOICES_PATH));
  console.log(`  done in ${(performance.now() - start).toFixed(0)} ms`);
  console.log(`  keys: ${Object.keys(entries).slice(0, 5).join(', ')} ...`);

  const voiceKey = Object.keys(entries).find(k => k.includes(voice)) ?? Object.keys(entries)[0];
  const { data: voiceData, shape } = parseNpy(entries[voiceKey]);
  const refId = Math.min(text.length, shape[0] - 1);
  const embSize = shape[shape.length - 1];
  const voiceEmbedding = voiceData.slice(refId * embSize, (refId + 1) * embSize);
  console.log(`  voice: ${voiceKey}  embedding: ${embSize}d`);

  const modelInputs = {
    input_ids: new ort.Tensor('int64', BigInt64Array.from(tokens.map(BigInt)), [1, tokens.length]),
    style:     new ort.Tensor('float32', voiceEmbedding, [1, voiceEmbedding.length]),
    speed:     new ort.Tensor('float32', new Float32Array([speed]), [1]),
  };

  console.log("Loading ORT session");
  start = performance.now();
  const session = await ort.InferenceSession.create(fs.readFileSync(MODEL_PATH), {
    executionProviders: ["cpu"],
  });
  console.log(`  done in ${(performance.now() - start).toFixed(0)} ms`);

  console.log("Running inference");
  start = performance.now();
  const results = await session.run(modelInputs);
  console.log(`  done in ${(performance.now() - start).toFixed(0)} ms`);

  const audioBuffer = createWavBuffer(results.waveform.data);
  fs.writeFileSync('test-output.wav', Buffer.from(audioBuffer));
  console.log(`Wrote test-output.wav (${results.waveform.data.length} samples)`);
}

main("Attention is all you need.").catch(console.error);
