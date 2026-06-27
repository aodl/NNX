import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeKnownNeuronNamesResponse,
  normalizeNeuronListResponse,
  normalizeOpenProposalListResponse,
  normalizeProposalInfo,
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

function proposalInfo(overrides = {}) {
  return {
    id: [{ id: 123n }],
    status: 1,
    topic: 4,
    proposal_timestamp_seconds: 10n,
    deadline_timestamp_seconds: [20n],
    latest_tally: [{
      yes: 25n,
      no: 75n,
      total: 100n,
      timestamp_seconds: 11n,
    }],
    reward_status: 1,
    decided_timestamp_seconds: 0n,
    proposal: [{
      title: ['Explicit title'],
      summary: 'Summary text for the proposal.',
      url: 'https://example.com',
      action: [],
      self_describing_action: [],
    }],
    proposer: [{ id: 456n }],
    ...overrides,
  };
}

test('normalizes proposal title when present', () => {
  const proposal = normalizeProposalInfo(proposalInfo());

  assert.equal(proposal.id, 123n);
  assert.equal(proposal.title, 'Explicit title');
  assert.equal(proposal.topicLabel, 'Governance');
  assert.equal(proposal.actionTypeName, null);
  assert.equal(proposal.actionDescription, 'Action unavailable.');
  assert.equal(proposal.actionDetails, null);
  assert.deepEqual(proposal.actionValues, []);
  assert.equal(proposal.status, 1);
  assert.equal(proposal.statusLabel, 'Open');
  assert.equal(proposal.statusKind, 'open');
  assert.equal(proposal.rewardStatusLabel, 'Accepting votes');
  assert.equal(proposal.decidedAtSeconds, 0n);
  assert.equal(proposal.proposerNeuronId, 456n);
  assert.equal(proposal.proposerKnownNeuronName, null);
});

test('normalizes known proposer neuron name when available', () => {
  const proposal = normalizeProposalInfo(
    proposalInfo(),
    new Map([['456', 'Known Proposer']]),
  );

  assert.equal(proposal.proposerNeuronId, 456n);
  assert.equal(proposal.proposerKnownNeuronName, 'Known Proposer');
});

test('normalizes proposal status labels', () => {
  assert.equal(normalizeProposalInfo(proposalInfo({ status: 2 })).statusLabel, 'Rejected');
  assert.equal(normalizeProposalInfo(proposalInfo({ status: 3 })).statusLabel, 'Adopted');
  assert.equal(normalizeProposalInfo(proposalInfo({ status: 4 })).statusLabel, 'Executed');
  assert.equal(normalizeProposalInfo(proposalInfo({ status: 5 })).statusLabel, 'Failed');
  assert.equal(normalizeProposalInfo(proposalInfo({ status: 999 })).statusLabel, 'Unknown');
  assert.equal(normalizeProposalInfo(proposalInfo({ status: 999 })).statusKind, 'unknown');
});

test('normalizes self describing proposal action', () => {
  const proposal = normalizeProposalInfo(proposalInfo({
    proposal: [{
      title: ['Motion proposal'],
      summary: 'Motion summary.',
      url: '',
      action: [{ Motion: { motion_text: 'Motion payload text.' } }],
      self_describing_action: [{
        type_name: ['Motion'],
        type_description: ['Motion payload text.'],
        value: [{
          Map: [
            ['motion_text', { Text: 'Motion payload text.' }],
            ['motion_id', { Nat: 42n }],
          ],
        }],
      }],
    }],
  }));

  assert.equal(proposal.actionTypeName, 'Motion');
  assert.equal(proposal.actionDescription, 'Motion payload text.');
  assert.equal(proposal.actionDetails, null);
  assert.deepEqual(proposal.actionValues, [
    { name: 'motion_text', value: 'Motion payload text.' },
    { name: 'motion_id', value: '42' },
  ]);
});

test('normalizes absent proposal title with summary fallback', () => {
  const proposal = normalizeProposalInfo(proposalInfo({
    proposal: [{
      title: [],
      summary: 'Fallback summary title with more than twelve words so it is shortened clearly.',
      url: '',
      action: [],
      self_describing_action: [],
    }],
  }));

  assert.equal(
    proposal.title,
    'Fallback summary title with more than twelve words so it is shortened',
  );
});

test('normalizes zero tally total safely', () => {
  const proposal = normalizeProposalInfo(proposalInfo({
    latest_tally: [{
      yes: 0n,
      no: 0n,
      total: 0n,
      timestamp_seconds: 11n,
    }],
  }));

  assert.deepEqual(proposal.tally, {
    yes: 0n,
    no: 0n,
    total: 0n,
    votedYesNoTotal: 0n,
    uncast: 0n,
    yesPercent: 0,
    noPercent: 0,
    uncastPercent: 0,
    yesVotePercent: 0,
    noVotePercent: 0,
  });
});

test('normalizes vote split percent from yes plus no', () => {
  const proposal = normalizeProposalInfo(proposalInfo({
    latest_tally: [{
      yes: 25n,
      no: 75n,
      total: 100n,
      timestamp_seconds: 11n,
    }],
  }));

  assert.equal(proposal.tally.votedYesNoTotal, 100n);
  assert.equal(proposal.tally.yesVotePercent, 25);
  assert.equal(proposal.tally.noVotePercent, 75);
  assert.equal(proposal.tally.uncast, 0n);
  assert.equal(proposal.tally.uncastPercent, 0);
});

test('normalizes vote split and uncast percent separately from total voting power', () => {
  const proposal = normalizeProposalInfo(proposalInfo({
    latest_tally: [{
      yes: 25n,
      no: 75n,
      total: 1000n,
      timestamp_seconds: 11n,
    }],
  }));

  assert.equal(proposal.tally.votedYesNoTotal, 100n);
  assert.equal(proposal.tally.yesVotePercent, 25);
  assert.equal(proposal.tally.noVotePercent, 75);
  assert.equal(proposal.tally.total, 1000n);
  assert.equal(proposal.tally.yesPercent, 2.5);
  assert.equal(proposal.tally.noPercent, 7.5);
  assert.equal(proposal.tally.uncast, 900n);
  assert.equal(proposal.tally.uncastPercent, 90);
});

test('normalizes zero yes and no as zero-vote split state', () => {
  const proposal = normalizeProposalInfo(proposalInfo({
    latest_tally: [{
      yes: 0n,
      no: 0n,
      total: 1000n,
      timestamp_seconds: 11n,
    }],
  }));

  assert.equal(proposal.tally.votedYesNoTotal, 0n);
  assert.equal(proposal.tally.yesVotePercent, 0);
  assert.equal(proposal.tally.noVotePercent, 0);
  assert.equal(proposal.tally.total, 1000n);
  assert.equal(proposal.tally.uncast, 1000n);
  assert.equal(proposal.tally.uncastPercent, 100);
});

test('normalizes missing deadline', () => {
  const proposal = normalizeProposalInfo(proposalInfo({ deadline_timestamp_seconds: [] }));

  assert.equal(proposal.deadlineTimestampSeconds, null);
  assert.equal(proposal.deadlineDate, null);
  assert.equal(proposal.timeRemainingSeconds, null);
  assert.equal(proposal.deadlineUrgencyPercent, 0);
  assert.equal(proposal.deadlineUrgencyLevel, 'unavailable');
});

test('normalizes passed deadline as expired urgency', () => {
  const originalNow = Date.now;
  Date.now = () => 100_000;
  try {
    const proposal = normalizeProposalInfo(proposalInfo({ deadline_timestamp_seconds: [90n] }));

    assert.equal(proposal.timeRemainingSeconds, 0);
    assert.equal(proposal.deadlineUrgencyPercent, 100);
    assert.equal(proposal.deadlineUrgencyLevel, 'expired');
  } finally {
    Date.now = originalNow;
  }
});

test('normalizes far future deadline as safe low urgency', () => {
  const originalNow = Date.now;
  Date.now = () => 100_000;
  try {
    const proposal = normalizeProposalInfo(proposalInfo({
      deadline_timestamp_seconds: [100n + 72n * 60n * 60n],
    }));

    assert.equal(proposal.deadlineUrgencyLevel, 'safe');
    assert.equal(proposal.deadlineUrgencyPercent, 6);
  } finally {
    Date.now = originalNow;
  }
});

test('normalizes near deadline as warning high urgency', () => {
  const originalNow = Date.now;
  Date.now = () => 100_000;
  try {
    const proposal = normalizeProposalInfo(proposalInfo({
      deadline_timestamp_seconds: [100n + 30n * 60n],
    }));

    assert.equal(proposal.deadlineUrgencyLevel, 'warning');
    assert.ok(proposal.deadlineUrgencyPercent > 95);
  } finally {
    Date.now = originalNow;
  }
});

test('normalizes unknown topic label fallback', () => {
  const proposal = normalizeProposalInfo(proposalInfo({ topic: 999 }));

  assert.equal(proposal.topicLabel, 'Topic 999');
});

test('preserves BigInt proposal IDs in proposal list response', () => {
  const [proposal] = normalizeOpenProposalListResponse([
    proposalInfo({ id: [{ id: 18_446_744_073_709_551_615n }] }),
  ], new Map([['456', 'Known Proposer']]));

  assert.equal(proposal.id, 18_446_744_073_709_551_615n);
  assert.equal(proposal.proposerKnownNeuronName, 'Known Proposer');
});
