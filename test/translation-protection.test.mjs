import assert from 'node:assert/strict';

function preserveProtectedTerms(input) {
  const protectedPattern = /(\{\{char\}\}|\{\{user\}\}|https?:\/\/\S+|[A-Za-z]:\\[^\s]+|`{3}[\s\S]*?`{3})/g;
  return input.match(protectedPattern) ?? [];
}

const text = '{{char}} opens https://example.test/a then checks C:\\cards\\mvu.json\n```json\n{"mvu_state":"safe"}\n```';
assert.deepEqual(preserveProtectedTerms(text), [
  '{{char}}',
  'https://example.test/a',
  'C:\\cards\\mvu.json',
  '```json\n{"mvu_state":"safe"}\n```',
]);

console.log('translation protection test passed');
