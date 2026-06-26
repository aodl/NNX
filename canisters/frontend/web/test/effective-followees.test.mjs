import assert from 'node:assert/strict';
import test from 'node:test';
import { getEffectiveFollowees } from '../src/data/effective-followees.js';

const neuron = {
  followeesPrivate: false,
  fullNeuron: {
    followees: [
      [0, { followees: [{ id: 10n }] }],
      [2, { followees: [{ id: 20n }] }],
      [3, { followees: [] }],
    ],
  },
};

test('explicit topic followees win', () => {
  assert.deepEqual(getEffectiveFollowees(neuron, { id: 2, fallback: true }).followees, [20n]);
});

test('explicit empty list does not fallback', () => {
  assert.deepEqual(getEffectiveFollowees(neuron, { id: 3, fallback: true }).followees, []);
});

test('missing topic falls back to CatchAll when allowed', () => {
  assert.deepEqual(getEffectiveFollowees(neuron, { id: 5, fallback: true }).followees, [10n]);
});

for (const [name, id] of [
  ['Governance', 4],
  ['Neuron Management', 1],
  ['SNS and Neurons Fund', 14],
]) {
  test(`${name} does not fallback`, () => {
    assert.deepEqual(getEffectiveFollowees(neuron, { id, fallback: false }).followees, []);
  });
}
