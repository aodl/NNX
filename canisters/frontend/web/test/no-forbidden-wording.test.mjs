import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const checkedFiles = [
  '../src/ui/theme.js',
  '../src/ui/theme-toggle.js',
  '../src/ui/app-shell.js',
  '../src/ui/home-page.js',
  '../src/ui/tokenomics-page.js',
  '../src/ui/metric-card.js',
  '../src/ui/charts.js',
];

test('new UI modules do not introduce raw DOWN or DEGRADED wording', async () => {
  for (const file of checkedFiles) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.equal(/\bDOWN\b/.test(source), false, file);
    assert.equal(/\bDEGRADED\b/.test(source), false, file);
  }
});
