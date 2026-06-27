import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRoute } from '../src/app/router.js';

test('valid neuron route', () => {
  assert.deepEqual(parseRoute('/neuron/123'), { kind: 'neuron', neuronId: 123n });
});

test('valid proposal route', () => {
  assert.deepEqual(parseRoute('/proposal/123'), { kind: 'proposal', proposalId: 123n });
});

test('root routes to home', () => {
  assert.deepEqual(parseRoute('/'), { kind: 'home' });
});

for (const path of [
  '/neuron/',
  '/neuron/abc',
  '/neuron/1/extra',
  '/neuron/-1',
  '/proposal/',
  '/proposal/abc',
  '/proposal/1/extra',
  '/proposal/-1',
]) {
  test(`invalid route ${path}`, () => {
    assert.deepEqual(parseRoute(path), { kind: 'not_found' });
  });
}

test('rejects values greater than nat64', () => {
  assert.deepEqual(parseRoute('/neuron/18446744073709551616'), { kind: 'not_found' });
  assert.deepEqual(parseRoute('/proposal/18446744073709551616'), { kind: 'not_found' });
});
