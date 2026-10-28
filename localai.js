// localai.js - background-side bridge to the WebLLM engine that lives in
// offscreen.html. Uses globals from shared.js (buildPrompt, parseAnswerLetters,
// buildMatchingPrompt, parseMatchingAnswer) and background.js (SYSTEM_PROMPT).

const LocalAi = (() => {
  // ~1 GB download, ~1.6 GB of GPU memory. Alternatives from WebLLM's prebuilt list:
  //   'Llama-3.2-1B-Instruct-q4f16_1-MLC'  (smaller/faster, a bit weaker)
  //   'Qwen2.5-3B-Instruct-q4f16_1-MLC'    (better, ~2 GB download)
  const MODEL_ID = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';
  let creating = null;

  async function ensureOffscreen() {
    const ctx = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (ctx.length) return;
    if (!creating) {
      creating = chrome.offscreen
        .createDocument({
          url: 'offscreen.html',
          reasons: ['WORKERS'],
          justification: 'Run a local language model (WebLLM/WebGPU) to answer quiz questions',
        })
        .finally(() => { creating = null; });
    }
    await creating;
  }

  async function call(msg) {
    await ensureOffscreen();
    const res = await chrome.runtime.sendMessage({ target: 'offscreen', modelId: MODEL_ID, ...msg });
    if (!res || !res.ok) throw new Error((res && res.error) || 'No response from local AI');
    return res;
  }

  async function getMode() {
    const s = await chrome.storage.local.get('localAiMode');
    return s.localAiMode || 'fallback'; // 'off' | 'fallback' | 'first'
  }

  // Never auto-downloads 1 GB: only loads a model that is already cached.
  async function ensureReady() {
    const st = await call({ type: 'status' });
    if (st.state === 'ready') return;
    if (!st.cached) {
      throw new Error('Local AI model is not downloaded yet (popup -> Local AI -> Download).');
    }
    await call({ type: 'init' });
  }

  async function askMcq(question, options, isMultiple, required) {
    await ensureReady();
    const res = await call({
      type: 'ask',
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(question, options, isMultiple, required),
      maxTokens: 24,
    });
    return parseAnswerLetters(res.text, options, isMultiple, required);
  }

  async function askMatching(rows) {
    await ensureReady();
    const res = await call({
      type: 'ask',
      system: MATCHING_SYSTEM_PROMPT,
      prompt: buildMatchingPrompt(rows),
      maxTokens: 400,
    });
    return parseMatchingAnswer(res.text, rows);
  }

  return {
    MODEL_ID, getMode, askMcq, askMatching,
    status: () => call({ type: 'status' }),
    init: () => call({ type: 'init' }),
    unload: () => call({ type: 'unload' }),
    deleteCache: () => call({ type: 'deleteCache' }),
  };
})();
