import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

assert.match(source, /MVU_INITIAL_COMMENT = '\[initvar\]/);
assert.match(source, /nextInitial\.enabled = false/);
assert.match(source, /comment\.includes\('\[initvar\]'\)/);
assert.match(source, /<JSONPatch>/);
assert.match(source, /ST_CARD_WRITER_MVU_TYPES_START/);
assert.match(source, /delta is allowed only for numbers/);
assert.match(source, /Never write display_data strings/);
assert.match(source, /testingcf\.jsdelivr\.net\/gh\/MagicalAstrogy\/MagVarUpdate@master\/artifact\/bundle\.js/);
assert.match(source, /MVU_RUNTIME_ID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'/);
assert.match(source, /prepareMvuCardForExport\(card\)/);
assert.match(source, /mergeLorebookEntries\(payload, project\.lorebook\.entries\)/);
assert.match(source, /MVU entries are edited through the MVU designer and remain its source of truth/);
assert.match(source, /candidate\.id === target\.entryId/);
assert.match(source, /syncMvuTypeContract\(rules\.content, clean\)/);

console.log('MVU export compatibility test passed');
