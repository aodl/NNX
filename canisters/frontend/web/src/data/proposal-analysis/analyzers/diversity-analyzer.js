import { CONCENTRATION_WARNING_MIN_DELTA } from '../analysis-policy.js';
import { PROPOSAL_ISSUE_CODES } from '../issue-codes.js';
import { createIssue } from '../proposal-analysis-types.js';
import { computeConcentrationMetric } from '../metrics/concentration-metrics.js';
import { computeDistanceMetric } from '../metrics/distance-metrics.js';
import { computeDiversityMetric } from '../metrics/diversity-metrics.js';

const DIVERSITY_CODES = Object.freeze({
  nodeProviders: PROPOSAL_ISSUE_CODES.DIVERSITY_DECREASED_NODE_PROVIDER,
  nodeOperators: PROPOSAL_ISSUE_CODES.DIVERSITY_DECREASED_NODE_OPERATOR,
  dataCenters: PROPOSAL_ISSUE_CODES.DIVERSITY_DECREASED_DATA_CENTER,
  owners: PROPOSAL_ISSUE_CODES.DIVERSITY_DECREASED_OWNER,
  countries: PROPOSAL_ISSUE_CODES.DIVERSITY_DECREASED_COUNTRY,
});

const CONCENTRATION_CODES = Object.freeze({
  provider: PROPOSAL_ISSUE_CODES.CONCENTRATION_INCREASED_PROVIDER,
  operator: PROPOSAL_ISSUE_CODES.CONCENTRATION_INCREASED_OPERATOR,
  dataCenter: PROPOSAL_ISSUE_CODES.CONCENTRATION_INCREASED_DATA_CENTER,
});

function label(key) {
  return key.replace(/[A-Z]/g, (match) => ` ${match.toLowerCase()}`);
}

export const diversityAnalyzer = Object.freeze({
  id: 'diversity',
  supports(intent) {
    return ['ChangeSubnetMembership', 'CreateSubnet', 'RemoveNodesFromSubnet'].includes(intent.actionKind);
  },
  analyze(context) {
    const common = {
      proposalId: context.intent.proposalId,
      actionKind: context.intent.actionKind,
      lifecycle: context.lifecycle,
    };
    const input = {
      beforeNodeIds: context.stateChange.beforeNodeIds,
      afterNodeIds: context.stateChange.afterNodeIds,
      nodesById: context.analysisContext.nodesById,
    };
    const diversity = computeDiversityMetric(input);
    const concentration = computeConcentrationMetric(input);
    const distance = computeDistanceMetric(input);
    const issues = [];

    for (const [key, delta] of Object.entries(diversity.deltas)) {
      if (delta < 0) {
        issues.push(createIssue({
          ...common,
          code: DIVERSITY_CODES[key],
          severity: key === 'countries' ? 'info' : 'warning',
          title: `${label(key)} diversity decreases`,
          message: `The number of distinct ${label(key)} decreases after this proposal.`,
          evidence: [
            { label: 'Before', value: diversity.before[key].toString() },
            { label: 'After', value: diversity.after[key].toString() },
          ],
        }));
      }
    }

    for (const [key, delta] of Object.entries(concentration.deltas)) {
      if (CONCENTRATION_CODES[key] && delta >= CONCENTRATION_WARNING_MIN_DELTA) {
        issues.push(createIssue({
          ...common,
          code: CONCENTRATION_CODES[key],
          severity: 'warning',
          title: `${label(key)} concentration increases`,
          message: `The maximum number of nodes sharing one ${label(key)} increases after this proposal.`,
          evidence: [
            { label: 'Before max', value: concentration.before[key].count.toString() },
            { label: 'After max', value: concentration.after[key].count.toString() },
          ],
        }));
      }
    }

    return {
      issues,
      metrics: { diversity, concentration, distance },
      dataWarnings: distance.dataWarnings,
    };
  },
});
