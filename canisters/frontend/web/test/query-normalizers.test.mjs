import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeKnownNeuronNamesResponse,
  normalizeNeuronListResponse,
} from '../src/data/query/query-normalizers.js';

test('prefers public NeuronInfo stake over cached full-neuron stake', () => {
  const [neuron] = normalizeNeuronListResponse(
    {
      neuron_infos: [[1n, { stake_e8s: 123n, visibility: [2] }]],
      full_neurons: [
        {
          id: [{ id: 1n }],
          controller: [],
          hot_keys: [],
          cached_neuron_stake_e8s: 999n,
          followees: [],
          visibility: [2],
        },
      ],
    },
    [1n],
  );

  assert.equal(neuron.stakeE8s, 123n);
});

test('preserves known neuron name from NeuronInfo', () => {
  const [neuron] = normalizeNeuronListResponse(
    {
      neuron_infos: [[1n, {
        stake_e8s: 123n,
        visibility: [2],
        known_neuron_data: [{ name: 'Known Node', description: [] }],
      }]],
      full_neurons: [],
    },
    [1n],
  );

  assert.equal(neuron.knownNeuronName, 'Known Node');
});

test('uses known neuron cache name when NeuronInfo omits known neuron data', () => {
  const [neuron] = normalizeNeuronListResponse(
    {
      neuron_infos: [[1n, { stake_e8s: 123n, visibility: [2] }]],
      full_neurons: [],
    },
    [1n],
    new Map([['1', 'Cached Known Node']]),
  );

  assert.equal(neuron.knownNeuronName, 'Cached Known Node');
});

test('normalizes list_known_neurons response into id name map', () => {
  const names = normalizeKnownNeuronNamesResponse({
    known_neurons: [
      {
        id: [{ id: 1n }],
        known_neuron_data: [{ name: 'Known Node', description: [] }],
      },
    ],
  });

  assert.equal(names.get('1'), 'Known Node');
});
