import assert from 'node:assert/strict';
import test from 'node:test';
import { diversityAnalyzer } from '../src/data/proposal-analysis/analyzers/diversity-analyzer.js';
import { PROPOSAL_ISSUE_CODES } from '../src/data/proposal-analysis/issue-codes.js';
import { computeDistanceMetric } from '../src/data/proposal-analysis/metrics/distance-metrics.js';
import { computeDiversityMetric } from '../src/data/proposal-analysis/metrics/diversity-metrics.js';

const nodesById = {
  a: { nodeProviderId: 'p1', nodeOperatorId: 'o1', dataCenterId: 'dc1', dataCenterOwner: 'owner1', dataCenterRegion: 'Zurich, CH', gps: { latitude: 47, longitude: 8 } },
  b: { nodeProviderId: 'p2', nodeOperatorId: 'o2', dataCenterId: 'dc2', dataCenterOwner: 'owner2', dataCenterRegion: 'Berlin, DE', gps: { latitude: 52, longitude: 13 } },
  c: { nodeProviderId: 'p1', nodeOperatorId: 'o3', dataCenterId: 'dc3', dataCenterOwner: 'owner3', dataCenterRegion: 'Paris, FR', gps: { latitude: 48, longitude: 2 } },
  missing: { nodeProviderId: 'p4', nodeOperatorId: 'o4', dataCenterId: 'dc4' },
  unknownGeo1: { nodeProviderId: 'p5', nodeOperatorId: 'o5', dataCenterId: 'dc5', dataCenterRegion: 'Unknown Place' },
  unknownGeo2: { nodeProviderId: 'p6', nodeOperatorId: 'o6', dataCenterId: 'dc6', dataCenterRegion: 'Another Unknown' },
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

test('diversity metrics use normalized country and continent fields', () => {
  const metric = computeDiversityMetric({ beforeNodeIds: ['a', 'b'], afterNodeIds: ['a', 'c'], nodesById });
  assert.equal(metric.before.countries, 2);
  assert.equal(metric.before.continents, 1);
});

test('diversity metrics degrade gracefully with unknown geography', () => {
  const metric = computeDiversityMetric({
    beforeNodeIds: ['unknownGeo1', 'unknownGeo2'],
    afterNodeIds: ['unknownGeo1'],
    nodesById,
  });
  assert.equal(metric.before.countries, 0);
  assert.equal(metric.after.countries, 0);
  assert.equal(metric.before.continents, 0);
  assert.equal(metric.after.continents, 0);
});

test('unknown country and continent do not emit false geography findings', () => {
  const result = diversityAnalyzer.analyze(ctx(['unknownGeo1', 'unknownGeo2'], ['unknownGeo1']));
  assert.equal(result.issues.some((issue) => (
    issue.code === PROPOSAL_ISSUE_CODES.DIVERSITY_DECREASED_COUNTRY
    || issue.code === PROPOSAL_ISSUE_CODES.DIVERSITY_DECREASED_CONTINENT
  )), false);
});
