// Thin wrapper — all heavy work runs in kitten.worker.js.

let _worker = null;
let _nextId = 0;
const _pendingJobs = {};
let _onProgress = null;

export function setProgressCallback(cb) {
  _onProgress = cb;
}

function getWorker() {
  if (!_worker) {
    _worker = new Worker(new URL('./kitten.worker.js', import.meta.url));
    _worker.onmessage = ({ data }) => {
      const { id: jobId, result, error, type, payload } = data;

      if (type === 'progress') {
        _onProgress?.(payload);
        return;
      }

      const handlers = _pendingJobs[jobId];
      if (!handlers) return;
      delete _pendingJobs[jobId];
      if (error) {
        handlers.reject(new Error(error));
      } else {
        handlers.resolve(result);
      }
    };
  }
  return _worker;
}

function sendJob(type, payload = {}) {
  return new Promise((resolve, reject) => {
    // const id = _nextId++;
    const jobId = `${type}-${_nextId++}`

    _pendingJobs[jobId] = { resolve, reject };
    getWorker().postMessage({ id: jobId, type, payload });
  });
}

export async function loadModel(url) {
  return await sendJob('loadModel', { url });
}

export async function tts(text, voice = "expr-voice-2-m", speed = 1.0) {
  const buffer = await sendJob('tts', { text, voice, speed });

  return new Blob([buffer], { type: 'audio/wav' });
}
