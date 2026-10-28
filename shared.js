function buildPrompt(question, options, isMultipleAnswer, requiredAnswers) {
  const optionLines = options.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`);
  if (isMultipleAnswer) {
    return [
      `Question: ${question}`,
      '',
      ...optionLines,
      '',
      `EXACTLY ${requiredAnswers} correct answer(s).`,
      `Answer with EXACTLY ${requiredAnswers} letter(s) separated by commas:`,
    ].join('\n');
  }
  return [
    `Question: ${question}`,
    '',
    ...optionLines,
    '',
    'Answer with only ONE letter:',
  ].join('\n');
}

function parseAnswerLetters(text, options, isMultipleAnswer, requiredAnswers) {
  const letters = String(text).toUpperCase().match(/[A-Z]/g) || [];
  const indexes = [];
  for (const letter of letters) {
    const index = letter.charCodeAt(0) - 65;
    if (index >= 0 && index < options.length && !indexes.includes(index)) indexes.push(index);
  }
  if (!indexes.length) throw new Error('AI response did not contain a valid answer letter.');
  if (!isMultipleAnswer) return indexes[0];
  if (indexes.length < requiredAnswers) {
    throw new Error(`AI response contained fewer than ${requiredAnswers} valid answer letters.`);
  }
  return indexes.slice(0, requiredAnswers);
}

function buildMatchingPrompt(rows) {
  const lines = ['Match each row to one option.'];
  rows.forEach((row, rowIndex) => {
    lines.push('', `Row ${rowIndex + 1}: "${row.prompt || ''}"`);
    row.options.forEach((option, optionIndex) => lines.push(`${optionIndex + 1}. ${option}`));
  });
  lines.push('', 'Answer with one "Row N: <option text>" line per row:');
  return lines.join('\n');
}

function parseMatchingAnswer(text, rows) {
  const lines = String(text).split(/\r?\n/);
  return rows.map((row, rowIndex) => {
    const prefix = new RegExp(`^\\s*row\\s*${rowIndex + 1}\\s*:\\s*(.*?)\\s*$`, 'i');
    const line = lines.find((candidate) => prefix.test(candidate));
    if (!line) throw new Error(`AI response is missing Row ${rowIndex + 1}.`);
    const match = line.match(prefix);
    const answer = match[1].trim();
    const optionIndex = row.options.findIndex(
      (option) => option.trim().toLowerCase() === answer.toLowerCase(),
    );
    if (optionIndex < 0) {
      throw new Error(`Row ${rowIndex + 1} answer doesn't match any option.`);
    }
    return { index: rowIndex, option: row.options[optionIndex] };
  });
}

if (typeof module !== 'undefined') {
  module.exports = { buildPrompt, parseAnswerLetters, buildMatchingPrompt, parseMatchingAnswer };
}
