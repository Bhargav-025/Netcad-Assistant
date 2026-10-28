// offscreen.js - hosts the in-browser LLM (WebLLM, runs on the GPU via WebGPU).
// Weights are downloaded ONCE and cached in this extension's own browser storage
// (Cache API under chrome-extension://<id>), so nothing is installed on the PC
// and uninstalling the extension removes the model.
import * as webllm from './vendor/web-llm.js';

let engine = null;
let loadingPromise = null;
let loadedModelId = null;
let state = 'idle'; // idle | loading | ready | error
let lastError = null;
let queue = Promise.resolve(); // run one generation at a time

function report(text, progress) {
  chrome.runtime.sendMessage({ action: 'localAiProgress', text, progress }).catch(() => {});
}

async function init(modelId) {
  if (engine && loadedModelId === modelId) return;
  if (loadingPromise) return loadingPromise;
  if (!('gpu' in navigator)) throw new Error('WebGPU is not available in this browser.');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error('No compatible GPU found for WebGPU.');

  state = 'loading';
  lastError = null;
  loadingPromise = webllm
    .CreateMLCEngine(modelId, {
      initProgressCallback: (r) => report(r.text, r.progress),
    })
    .then((e) => {
      engine = e;
      loadedModelId = modelId;
      state = 'ready';
    })
    .catch((err) => {
      state = 'error';
      lastError = err.message || String(err);
      throw err;
    })
    .finally(() => { loadingPromise = null; });
  return loadingPromise;
}

async function ask({ system, prompt, maxTokens }) {
  if (!engine) throw new Error('Local model is not loaded.');
  const reply = await engine.chat.completions.create({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    temperature: 0,
    max_tokens: maxTokens || 32,
  });
  return reply.choices[0].message.content || '';
}

async function handle(msg) {
  switch (msg.type) {
    case 'status':
      return {
        state,
        error: lastError,
        cached: await webllm.hasModelInCache(msg.modelId).catch(() => false),
      };
    case 'init':
      await init(msg.modelId);
      return { state };
    case 'ask': {
      const run = queue.then(() => ask(msg));
      queue = run.catch(() => {});
      return { text: await run };
    }
    case 'unload':
      if (engine) { await engine.unload(); engine = null; loadedModelId = null; }
      state = 'idle';
      return { state };
    case 'deleteCache':
      if (engine) { await engine.unload(); engine = null; loadedModelId = null; }
      await webllm.deleteModelAllInfoInCache(msg.modelId);
      state = 'idle';
      return { state };
    default:
      throw new Error('Unknown offscreen message: ' + msg.type);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== 'offscreen') return; // not for us
  handle(msg)
    .then((data) => sendResponse({ ok: true, ...data }))
    .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
  return true;
});
