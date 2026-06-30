import assert from 'node:assert/strict';
import test from 'node:test';
import { GUARANTEE_ANCHOR_NEURONS } from '../src/app/config.js';
import { getGuaranteeStatus } from '../src/data/guarantee-status.js';

const topic = { id: 2, fallback: true };
const anchor = GUARANTEE_ANCHOR_NEURONS.alphaVote;

function neuron(id, followees, extra = {}) {
  return {
    id: BigInt(id),
    exists: true,
    public: true,
    followeesPrivate: false,
    fullNeuron: {
      followees: [[2, { followees: followees.map((followee) => ({ id: BigInt(followee) })) }]],
    },
    ...extra,
  };
}

function loader(map) {
  return {
    async loadNeuron(id) {
      const found = map.get(id.toString());
      if (!found) return { id, exists: false };
      return found;
    },
  };
}

test('direct anchor followees are guaranteed', async () => {
  const proof = await getGuaranteeStatus({
    neuron: neuron(1, [anchor]),
    topic,
    neuronLoader: loader(new Map([[anchor.toString(), neuron(anchor, [], {
      hotkeys: ['aaaaa-aa', 'bbbbb-bb'],
      hotkeysPrivate: false,
      knownNeuronName: 'Known Anchor',
    })]])),
  });
  assert.equal(proof.status, 'guaranteed_yes');
  assert.equal(proof.children[0].knownNeuronName, 'Known Anchor');
  assert.deepEqual(proof.children[0].hotkeys, ['aaaaa-aa', 'bbbbb-bb']);
});

test('all transitive anchor-terminated followees are guaranteed', async () => {
  const n2 = neuron(2, [anchor]);
  const proof = await getGuaranteeStatus({
    neuron: neuron(1, [2n]),
    topic,
    neuronLoader: loader(new Map([['2', n2]])),
  });
  assert.equal(proof.status, 'guaranteed_yes');
  assert.equal(proof.neuronId, 1n);
  assert.equal(proof.children[0].neuronId, 2n);
});

test('one non-anchor no-followee blocker is not guaranteed', async () => {
  const n2 = neuron(2, []);
  const proof = await getGuaranteeStatus({
    neuron: neuron(1, [anchor, 2n]),
    topic,
    neuronLoader: loader(new Map([['2', n2]])),
  });
  assert.equal(proof.status, 'not_guaranteed');
});

test('private transitive followee is unknown', async () => {
  const n2 = neuron(2, [], { public: false, followeesPrivate: true });
  const proof = await getGuaranteeStatus({
    neuron: neuron(1, [2n]),
    topic,
    neuronLoader: loader(new Map([['2', n2]])),
  });
  assert.equal(proof.status, 'unknown');
  assert.equal(proof.reason, 'private_followee');
});

test('depth limit reached is unknown with depth_limit', async () => {
  const n2 = neuron(2, [3n]);
  const n3 = neuron(3, [anchor]);
  const proof = await getGuaranteeStatus({
    neuron: neuron(1, [2n]),
    topic,
    neuronLoader: loader(new Map([['2', n2], ['3', n3]])),
    maxDepth: 0,
  });
  assert.equal(proof.status, 'unknown');
  assert.equal(proof.reason, 'depth_limit');
});

test('cycle is not guaranteed', async () => {
  const n1 = neuron(1, [2n]);
  const n2 = neuron(2, [1n]);
  const proof = await getGuaranteeStatus({
    neuron: n1,
    topic,
    neuronLoader: loader(new Map([['1', n1], ['2', n2]])),
  });
  assert.equal(proof.status, 'unknown');
  assert.equal(proof.reason, 'cycle');
});

test('2 Yes of 3 is guaranteed yes', async () => {
  const n2 = neuron(2, []);
  const proof = await getGuaranteeStatus({
    neuron: neuron(1, [anchor, GUARANTEE_ANCHOR_NEURONS.omegaVote, 2n]),
    topic,
    neuronLoader: loader(new Map([['2', n2]])),
  });
  assert.equal(proof.status, 'guaranteed_yes');
});

test('1 Yes of 2 is not guaranteed yes', async () => {
  const n2 = neuron(2, []);
  const proof = await getGuaranteeStatus({
    neuron: neuron(1, [anchor, 2n]),
    topic,
    neuronLoader: loader(new Map([['2', n2]])),
  });
  assert.equal(proof.status, 'not_guaranteed');
});

test('omega reject plus one other blocker is guaranteed', async () => {
  const n2 = neuron(2, []);
  const proof = await getGuaranteeStatus({
    neuron: neuron(1, [GUARANTEE_ANCHOR_NEURONS.omegaReject, 2n]),
    topic,
    neuronLoader: loader(new Map([['2', n2]])),
  });
  assert.equal(proof.status, 'guaranteed_no');
});

test('omega reject plus one private followee is guaranteed', async () => {
  const n2 = neuron(2, [], { public: false, followeesPrivate: true });
  const proof = await getGuaranteeStatus({
    neuron: neuron(1, [GUARANTEE_ANCHOR_NEURONS.omegaReject, 2n]),
    topic,
    neuronLoader: loader(new Map([['2', n2]])),
  });
  assert.equal(proof.status, 'guaranteed_no');
});

test('1 No of 3 is not guaranteed no', async () => {
  const n2 = neuron(2, []);
  const n3 = neuron(3, []);
  const proof = await getGuaranteeStatus({
    neuron: neuron(1, [GUARANTEE_ANCHOR_NEURONS.omegaReject, 2n, 3n]),
    topic,
    neuronLoader: loader(new Map([['2', n2], ['3', n3]])),
  });
  assert.equal(proof.status, 'not_guaranteed');
});

test('2 No of 3 is guaranteed no', async () => {
  const n2 = neuron(2, [GUARANTEE_ANCHOR_NEURONS.omegaReject]);
  const n3 = neuron(3, []);
  const proof = await getGuaranteeStatus({
    neuron: neuron(1, [GUARANTEE_ANCHOR_NEURONS.omegaReject, 2n, 3n]),
    topic,
    neuronLoader: loader(new Map([['2', n2], ['3', n3]])),
  });
  assert.equal(proof.status, 'guaranteed_no');
});

test('omega reject plus one cyclic followee is guaranteed transitively', async () => {
  const n1 = neuron(1, [2n]);
  const n2 = neuron(2, [GUARANTEE_ANCHOR_NEURONS.omegaReject, 1n]);
  const proof = await getGuaranteeStatus({
    neuron: n1,
    topic,
    neuronLoader: loader(new Map([['1', n1], ['2', n2]])),
  });
  assert.equal(proof.status, 'guaranteed_no');
  assert.equal(proof.children[0].status, 'guaranteed_no');
});
