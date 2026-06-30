import assert from 'node:assert/strict';
import test from 'node:test';
import { diversityAnalyzer } from '../src/data/proposal-analysis/analyzers/diversity-analyzer.js';
import { PROPOSAL_ISSUE_CODES } from '../src/data/proposal-analysis/issue-codes.js';
import { computeDistanceMetric } from '../src/data/proposal-analysis/metrics/distance-metrics.js';

const nodesById = {
  a: { nodeProviderId: 'p1', nodeOperatorId: 'o1', dataCenterId: 'dc1', dataCenterOwner: 'owner1', dataCenterRegion: 'Zurich, CH', gps: { latitude: 47, longitude: 8 } },
  b: { nodeProviderId: 'p2', nodeOperatorId: 'o2', dataCenterId: 'dc2', dataCenterOwner: 'owner2', dataCenterRegion: 'Berlin, DE', gps: { latitude: 52, longitude: 13 } },
  c: { nodeProviderId: 'p1', nodeOperatorId: 'o3', dataCenterId: 'dc3', dataCenterOwner: 'owner3', dataCenterRegion: 'Paris, FR', gps: { latitude: 48, longitude: 2 } },
  missing: { nodeProviderId: 'p4', nodeOperatorId: 'o4', dataCenterId: 'dc4' },
};

function ctx(beforeNodeIds, afterNodeIds) {
  return {
    lifecycle: 'pre_execution',
    intent: { proposalId: 1n, actionKind: 'ChangeSubnetMembership' },
    stateChange: { beforeNodeIds, afterNodeIds },
    analysisContext: { nodesById },
  };
}

test('provider count decrease emits warning', () => {
  const result = diversityAnalyzer.analyze(ctx(['a', 'b'], ['a', 'c']));
  assert.ok(result.issues.some((issue) => issue.code === PROPOSAL_ISSUE_CODES.DIVERSITY_DECREASED_NODE_PROVIDER));
});

test('same provider count emits no diversity warning', () => {
  const result = diversityAnalyzer.analyze(ctx(['a', 'c'], ['a', 'c']));
  assert.equal(result.issues.some((issue) => issue.code === PROPOSAL_ISSUE_CODES.DIVERSITY_DECREASED_NODE_PROVIDER), false);
});

test('concentration increase emits warning', () => {
  const result = diversityAnalyzer.analyze(ctx(['a', 'b'], ['a', 'c']));
  assert.ok(result.issues.some((issue) => issue.code === PROPOSAL_ISSUE_CODES.CONCENTRATION_INCREASED_PROVIDER));
});

test('distance metrics handle zero and one node safely', () => {
  assert.equal(computeDistanceMetric({ beforeNodeIds: [], afterNodeIds: ['a'], nodesById }).after.pairCount, 0);
});

test('missing GPS creates data warning and does not crash', () => {
  const result = computeDistanceMetric({ beforeNodeIds: ['a', 'missing'], afterNodeIds: ['missing'], nodesById });
  assert.ok(result.dataWarnings.length >= 1);
});
