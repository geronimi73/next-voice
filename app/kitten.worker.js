import * as ort from 'onnxruntime-web';
import { processText, createWavBuffer, downloadWithProgress, parseNpz, parseNpy } from './kitten.utils.js';

// Workaround to issue below by Claude Code
// https://github.com/microsoft/onnxruntime/issues/25096
//
// tl;dr Turbopack runs this worker as a blob URL, so Chrome can't resolve origin-relative
// paths like /_next/static/media/xxx.wasm against the blob:// base. Patch fetch and
// XHR to prepend the origin before ort tries to load its wasm files.
//
// Here's the chain of events:
// 1. Turbopack runs the worker as a blob URL
// When Next.js/Turbopack bundles kitten.worker.js, it wraps it in a
// blob:http://localhost:3000/<uuid> URL rather than serving it at a proper http:// path.
//
// 2. ort detects a "Node.js-like" environment
// Inside the ort bundle, Turbopack sets import.meta.url to
// file:///path/to/ort.all.bundle.min.mjs. ort sees a file:// URL and concludes it's running in
// a Node.js context. This triggers it to auto-set its wasm path using Turbopack's resolved URL.
//
// 3. Turbopack's wasm URL is relative
// Turbopack registers the wasm file as a module that exports the relative path
// /_next/static/media/ort-wasm-simd-threaded.jsep.dd2bd3de.wasm. This relative path works fine
// in the main thread (where fetch('/_next/...') resolves against http://localhost:3000).
//
// 4. Chrome can't resolve the relative path in a blob worker
// In the blob URL worker, self.location.href is blob:http://localhost:3000/<uuid>. When ort
// calls fetch('/_next/static/media/...'), Chrome tries to resolve the relative path against the
//  blob URL base. The URL spec doesn't support resolving origin-relative paths against blob
// URLs — so Chrome throws "Failed to parse URL".
//
// Why previous attempts failed:
// - wasmPaths = 'http://localhost:3000/_next/static/media/' (string form) → ort appends the
// unhashed filename → 404
// - Direct .wasm import → Turbopack treated it as a WebAssembly module, not a URL string
// - proxy = false → correct direction, but the same fetch issue remained in the kitten worker
// itself
//
// The fix:
// Patch globalThis.fetch at worker load time to prepend self.location.origin to any path
// starting with /. This converts /_next/static/media/ort-wasm-simd-threaded.jsep.dd2bd3de.wasm
// → http://localhost:3000/_next/static/media/ort-wasm-simd-threaded.jsep.dd2bd3de.wasm — a
// valid absolute URL Chrome can fetch from anywhere, including inside a blob worker.
const _origin = self.location.origin;
const _fetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, init) => {
  if (typeof input === 'string' && input.startsWith('/')) input = _origin + input;
  return _fetch(input, init);
};


// ── Model / Voice Cache ───────────────────────────────────────────────────────
let _session = null;
let _voices = null;
let _device = null;

function disposeSession() {
  if (_session) {
    try { _session.release(); } catch { /* ignore */ }
  }
  _session = null;
  _voices = null;
  _device = null;
}

async function getSession(url) {
  if (_session) return _session;

  _device = null;

  const buffer = await downloadWithProgress(url, (loaded, total) => {
    self.postMessage({ type: 'progress', payload: loaded / total });
  });

  for (let device of [
    // "webgpu",   // doesnt work
    "wasm"
  ]) {
    try {
      _session = await ort.InferenceSession.create(buffer, {
        executionProviders: [device],
      });
      _device = device;

      return _session
    }
    catch(e) {
      console.log("InferenceSession.create failed for EP", device)
      // fail silent
    }
  }
  throw new Error("InferenceSession.create failed")
}

async function getVoices(modelUrl) {
  const voicesUrl = modelUrl.replace(/[^/]+\.onnx$/, 'voices.npz');
  const buffer = await downloadWithProgress(voicesUrl);
  const entries = await parseNpz(buffer);

  _voices = {};
  for (const [key, arrayBuffer] of Object.entries(entries)) {
    const { data, shape } = parseNpy(arrayBuffer);
    const [numStyles, embeddingDim] = shape;
    _voices[key] = Array.from({ length: numStyles }, (_, i) =>
      data.slice(i * embeddingDim, (i + 1) * embeddingDim)
    );
  }

  return _voices;
}

// ── Handlers ──────────────────────────────────────────────────────────────────
async function handleTts(text, voice = "expr-voice-2-m", speed = 1.0) {
  const tokens = await processText(text)

  if (!voice in _voices) {
    throw new Error("Unknown voice with id " + voice);
  }
  // Choose voice embedding, the longer the text, the higher the index (?) OK
  // https://github.com/KittenML/KittenTTS/blob/49691a2361cd66a9502c466303c9fec783e9e438/kittentts/onnx_model.py#L131
  const voiceEmbedding = _voices[voice][
    Math.min(text.length, _voices[voice].length - 1)
  ];

  const inputs = {
    input_ids: new ort.Tensor('int64', tokens, [1, tokens.length]),
    style:     new ort.Tensor('float32', voiceEmbedding, [1, voiceEmbedding.length]),
    speed:     new ort.Tensor('float32', new Float32Array([speed]), [1]),
  };

  const results = await _session.run(inputs);
  return createWavBuffer(results.waveform.data);
}

// ── Message Loop ──────────────────────────────────────────────────────────────
self.onmessage = async ({ data: { id, type, payload } }) => {
  try {
    let result;
    if (type === 'loadModel') {
      disposeSession()

      await Promise.all([
        getSession(payload.url), 
        getVoices(payload.url)
      ]);
      self.postMessage({ id, result: _device });

    } else if (type === 'tts') {
      result = await handleTts(payload.text, payload.voice, payload.speed);
      // Transfer the ArrayBuffer to avoid copying
      self.postMessage({ id, result }, [result]);
    }
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
