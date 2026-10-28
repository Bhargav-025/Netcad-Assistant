const LocalBrain = (() => {
  const STORAGE_KEY = 'netAIcadAnswerBank';

  function key(parts) {
    return JSON.stringify(parts);
  }

  async function read() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || {};
  }

  async function write(bank) {
    await chrome.storage.local.set({ [STORAGE_KEY]: bank });
  }

  async function lookupMcq(question, options, isMultipleAnswer, requiredAnswers) {
    const bank = await read();
    const entry = bank[key(['mcq', question.trim(), options, isMultipleAnswer, requiredAnswers])];
    return entry || null;
  }

  async function saveMcq(question, options, answerIndex) {
    const bank = await read();
    const isMultipleAnswer = Array.isArray(answerIndex);
    const requiredAnswers = isMultipleAnswer ? answerIndex.length : 1;
    bank[key(['mcq', question.trim(), options, isMultipleAnswer, requiredAnswers])] = {
      answerIndex,
      score: 1,
    };
    await write(bank);
  }

  async function lookupMatching(rows) {
    const bank = await read();
    return bank[key(['matching', rows])]?.rowAnswers || null;
  }

  async function saveMatching(rows, rowAnswers) {
    const bank = await read();
    bank[key(['matching', rows])] = { rowAnswers };
    await write(bank);
  }

  return { lookupMcq, saveMcq, lookupMatching, saveMatching };
})();
