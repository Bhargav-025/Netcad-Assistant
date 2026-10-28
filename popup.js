// Popup script for configuration
document.addEventListener('DOMContentLoaded', async () => {
  const openAiApiKeyInput = document.getElementById('openAiApiKey');
  const geminiApiKeyInput = document.getElementById('geminiApiKey');
  const saveBtn = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');
  const testOpenAiBtn = document.getElementById('testOpenAi');
  const testGeminiBtn = document.getElementById('testGemini');
  const openAiStatus = document.getElementById('openAiStatus');
  const geminiStatus = document.getElementById('geminiStatus');

  // Load saved settings
  const settings = await chrome.storage.sync.get([
    'openAiApiKey',
    'geminiApiKey'
  ]);

  if (settings.openAiApiKey) {
    openAiApiKeyInput.value = settings.openAiApiKey;
  }

  if (settings.geminiApiKey) {
    geminiApiKeyInput.value = settings.geminiApiKey;
  }

  // Save settings
  saveBtn.addEventListener('click', async () => {
    const openAiApiKey = openAiApiKeyInput.value.trim();
    const geminiApiKey = geminiApiKeyInput.value.trim();

    // Validation - at least one API key is required
    if (!openAiApiKey && !geminiApiKey) {
      showStatus('Please enter at least one API key', 'error');
      return;
    }

    try {
      await chrome.storage.sync.set({
        openAiApiKey: openAiApiKey,
        geminiApiKey: geminiApiKey
      });

      showStatus('Settings saved successfully!', 'success');
    } catch (error) {
      showStatus('Error saving settings: ' + error.message, 'error');
    }
  });

  // Test OpenAI API key
  testOpenAiBtn.addEventListener('click', async () => {
    const key = openAiApiKeyInput.value.trim();
    if (!key) {
      showTestStatus(openAiStatus, false, 'Enter a key first');
      return;
    }

    setTesting(testOpenAiBtn, true);
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${key}` }
      });

      if (response.ok) {
        showTestStatus(openAiStatus, true, 'Valid');
      } else {
        const data = await response.json().catch(() => ({}));
        showTestStatus(openAiStatus, false, data.error?.message || 'Invalid key');
      }
    } catch (error) {
      showTestStatus(openAiStatus, false, 'Network error');
    } finally {
      setTesting(testOpenAiBtn, false);
    }
  });

  // Test Gemini API key
  testGeminiBtn.addEventListener('click', async () => {
    const key = geminiApiKeyInput.value.trim();
    if (!key) {
      showTestStatus(geminiStatus, false, 'Enter a key first');
      return;
    }

    setTesting(testGeminiBtn, true);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
      );

      if (response.ok) {
        showTestStatus(geminiStatus, true, 'Valid');
      } else {
        const data = await response.json().catch(() => ({}));
        showTestStatus(geminiStatus, false, data.error?.message || 'Invalid key');
      }
    } catch (error) {
      showTestStatus(geminiStatus, false, 'Network error');
    } finally {
      setTesting(testGeminiBtn, false);
    }
  });

  // ---- Local answer bank ----
  const bankEnabled = document.getElementById('bankEnabled');
  const bankStats = document.getElementById('bankStats');
  const bankFile = document.getElementById('bankFile');

  async function refreshBank() {
    const s = await chrome.storage.local.get(['localBank', 'localBankEnabled']);
    const vals = Object.values(s.localBank || {});
    bankEnabled.checked = s.localBankEnabled !== false;
    bankStats.textContent =
      `${vals.length} saved answers, ${vals.reduce((n, e) => n + (e.hits || 0), 0)} served locally`;
  }
  await refreshBank();

  bankEnabled.addEventListener('change', () =>
    chrome.storage.local.set({ localBankEnabled: bankEnabled.checked }));

  document.getElementById('bankExport').addEventListener('click', async () => {
    const { localBank } = await chrome.storage.local.get('localBank');
    const blob = new Blob([JSON.stringify(localBank || {})], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'netaicad-bank.json';
    a.click();
  });

  document.getElementById('bankImport').addEventListener('click', () => bankFile.click());
  bankFile.addEventListener('change', async () => {
    try {
      const incoming = JSON.parse(await bankFile.files[0].text());
      const { localBank } = await chrome.storage.local.get('localBank');
      await chrome.storage.local.set({ localBank: { ...(localBank || {}), ...incoming } });
      showStatus('Bank imported', 'success');
    } catch (e) {
      showStatus('Import failed: ' + e.message, 'error');
    }
    bankFile.value = '';
    refreshBank();
  });

  document.getElementById('bankClear').addEventListener('click', async () => {
    if (!confirm('Delete all saved answers?')) return;
    await chrome.storage.local.set({ localBank: {} });
    refreshBank();
  });

  // ---- Local AI (WebLLM) ----
  const aiMode = document.getElementById('aiMode');
  const aiStatus = document.getElementById('aiStatus');
  const aiDownload = document.getElementById('aiDownload');
  const aiDelete = document.getElementById('aiDelete');

  aiMode.value = (await chrome.storage.local.get('localAiMode')).localAiMode || 'fallback';
  aiMode.addEventListener('change', () => chrome.storage.local.set({ localAiMode: aiMode.value }));

  async function refreshAi() {
    const r = await chrome.runtime.sendMessage({ action: 'localAiStatus' }).catch(() => null);
    if (!r || !r.success) { aiStatus.textContent = 'Unavailable: ' + ((r && r.error) || 'no response'); return; }
    if (r.state === 'ready') aiStatus.textContent = '✓ Model loaded and ready';
    else if (r.state === 'loading') aiStatus.textContent = 'Loading model...';
    else if (r.cached) aiStatus.textContent = 'Downloaded (loads automatically when needed)';
    else aiStatus.textContent = 'Not downloaded';
    if (r.error) aiStatus.textContent += ' | last error: ' + r.error;
    aiDownload.textContent = r.cached ? 'Load now' : 'Download model';
  }
  refreshAi();

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'localAiProgress') {
      aiStatus.textContent = `${Math.round((msg.progress || 0) * 100)}% - ${msg.text}`;
    }
  });

  aiDownload.addEventListener('click', async () => {
    aiDownload.disabled = true;
    aiStatus.textContent = 'Starting...';
    const r = await chrome.runtime.sendMessage({ action: 'localAiInit' }).catch((e) => ({ success: false, error: e.message }));
    aiDownload.disabled = false;
    if (!r.success) showStatus('Local AI: ' + r.error, 'error');
    refreshAi();
  });

  aiDelete.addEventListener('click', async () => {
    if (!confirm('Delete the downloaded model (~1 GB)?')) return;
    await chrome.runtime.sendMessage({ action: 'localAiDelete' }).catch(() => {});
    refreshAi();
  });

  function setTesting(button, isTesting) {
    button.disabled = isTesting;
    button.textContent = isTesting ? '...' : 'Test';
  }

  function showTestStatus(el, ok, message) {
    el.textContent = ok ? '✓ ' + message : '✗ ' + message;
    el.className = 'test-status show ' + (ok ? 'ok' : 'fail');

    clearTimeout(el._hideTimeout);
    el._hideTimeout = setTimeout(() => {
      el.classList.remove('show');
    }, 4000);
  }

  function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
    statusDiv.style.display = 'block';

    if (type === 'success') {
      setTimeout(() => {
        statusDiv.style.display = 'none';
      }, 3000);
    }
  }
});
