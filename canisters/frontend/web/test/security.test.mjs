import assert from 'node:assert/strict';
import test from 'node:test';

import { safeExternalUrl } from '../src/security/safe-url.js';

test('safeExternalUrl accepts https and normalizes it', () => {
  assert.equal(safeExternalUrl(' https://example.com/a b '), 'https://example.com/a%20b');
});

test('safeExternalUrl rejects unsafe or malformed URLs', () => {
  for (const value of [
    '',
    '   ',
    'javascript:alert(1)',
    'data:text/html,hi',
    'blob:https://example.com/id',
    'file:///tmp/a',
    'http://example.com',
    'https://example.com/\nnext',
    'not a url',
  ]) {
    assert.equal(safeExternalUrl(value), null, value);
  }
});

test('safeExternalUrl only allows http when caller opts in', () => {
  assert.equal(safeExternalUrl('http://localhost:4943', { allowHttp: true }), 'http://localhost:4943/');
});
