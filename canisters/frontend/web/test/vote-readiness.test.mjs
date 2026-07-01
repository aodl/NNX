import assert from 'node:assert/strict';
import test from 'node:test';
import { PROPOSAL_ISSUE_CODES } from '../src/data/proposal-analysis/issue-codes.js';
import { classifyVoteReadiness, readinessLabel } from '../src/data/proposal-analysis/vote-readiness.js';
import { lifecycleLabel, nodeMetricSignalLabel, severityLabel } from '../src/ui/labels.js';

function analysis(overrides = {}) {
  const issues = overrides.issues ?? [];
  return {
    actionKind: overrides.actionKind ?? 'ChangeSubnetMembership',
    lifecycle: overrides.lifecycle ?? 'pre_execution',
    confidence: overrides.confidence ?? 'high',
    issues,
    dataWarnings: overrides.dataWarnings ?? [],
    summary: {
      criticalCount: issues.filter((issue) => issue.severity === 'critical').length,
      warningCount: issues.filter((issue) => issue.severity === 'warning').length,
      manualReviewCount: issues.filter((issue) => issue.severity === 'manual_review').length,
      infoCount: issues.filter((issue) => issue.severity === 'info').length,
    },
  };
}

test('ready classification with supported action and no manual blockers', () => {
  assert.equal(classifyVoteReadiness(analysis()), 'ready');
  assert.equal(readinessLabel('ready'), 'Review-ready');
});

test('needs manual review with manual-review issues', () => {
  assert.equal(classifyVoteReadiness(analysis({
    issues: [{ severity: 'manual_review', lifecycle: 'pre_execution' }],
  })), 'needs_manual_review');
});

test('unsupported with UNSUPPORTED_PROPOSAL_ANALYSIS', () => {
  assert.equal(classifyVoteReadiness(analysis({
    actionKind: 'Unsupported',
    confidence: 'unsupported',
    issues: [{
      code: PROPOSAL_ISSUE_CODES.UNSUPPORTED_PROPOSAL_ANALYSIS,
      severity: 'info',
      lifecycle: 'pre_execution',
    }],
  })), 'unsupported');
});

test('misleading when issue lifecycle contradicts analysis lifecycle', () => {
  assert.equal(classifyVoteReadiness(analysis({
    lifecycle: 'post_execution_success',
    issues: [{ severity: 'warning', lifecycle: 'pre_execution' }],
  })), 'misleading');
});

test('bug suspected for critical issue', () => {
  assert.equal(classifyVoteReadiness(analysis({
    issues: [{ severity: 'critical', lifecycle: 'pre_execution' }],
  })), 'bug_suspected');
});

test('humanized labels preserve safe node metric terminology', () => {
  assert.equal(nodeMetricSignalLabel('healthy_signal'), 'Healthy signal');
  assert.equal(nodeMetricSignalLabel('elevated_failure_signal'), 'Elevated failure signal');
  assert.equal(nodeMetricSignalLabel('inactive_or_no_block_signal'), 'Inactive/no-block signal');
  assert.equal(lifecycleLabel('post_execution_failed'), 'Failed execution');
  assert.equal(severityLabel('manual_review'), 'Manual review');
  const text = [
    nodeMetricSignalLabel('healthy_signal'),
    nodeMetricSignalLabel('elevated_failure_signal'),
    nodeMetricSignalLabel('inactive_or_no_block_signal'),
  ].join(' ');
  assert.equal(/\bDOWN\b|\bDEGRADED\b/i.test(text), false);
});

