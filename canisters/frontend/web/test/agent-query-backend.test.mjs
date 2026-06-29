import assert from 'node:assert/strict';
import test from 'node:test';
import {
  listAcceptingVotesProposalInfos,
  listAcceptingVotesProposalsRequest,
} from '../src/data/query/agent-query-backend.js';

test('builds list_proposals request for proposals accepting votes', () => {
  assert.deepEqual(listAcceptingVotesProposalsRequest(), {
    include_reward_status: [1],
    omit_large_fields: [false],
    before_proposal: [],
    limit: 100,
    exclude_topic: [],
    include_all_manage_neuron_proposals: [],
    include_status: [],
    return_self_describing_action: [true],
  });

  assert.deepEqual(
    listAcceptingVotesProposalsRequest(123n).before_proposal,
    [{ id: 123n }],
  );
});

test('pages accepting-votes proposals using last proposal id', async () => {
  const requests = [];
  const governance = {
    async list_proposals(request) {
      requests.push(request);
      if (requests.length === 1) {
        return {
          proposal_info: Array.from({ length: 100 }, (_, index) => ({
            id: [{ id: BigInt(200 - index) }],
          })),
        };
      }
      return {
        proposal_info: [
          { id: [{ id: 100n }] },
          { id: [{ id: 99n }] },
        ],
      };
    },
  };

  const proposals = await listAcceptingVotesProposalInfos({ governance });

  assert.equal(proposals.length, 102);
  assert.deepEqual(requests.map((request) => request.before_proposal), [
    [],
    [{ id: 101n }],
  ]);
});

test('deduplicates paged accepting-votes proposal results', async () => {
  const governance = {
    calls: 0,
    async list_proposals() {
      this.calls += 1;
      return this.calls === 1
        ? {
          proposal_info: Array.from({ length: 100 }, (_, index) => ({
            id: [{ id: BigInt(200 - index) }],
          })),
        }
        : { proposal_info: [{ id: [{ id: 101n }] }, { id: [{ id: 100n }] }] };
    },
  };

  const proposals = await listAcceptingVotesProposalInfos({ governance });

  assert.equal(proposals.length, 101);
  assert.deepEqual(
    proposals.slice(-2).map((proposal) => proposal.id[0].id),
    [101n, 100n],
  );
});
