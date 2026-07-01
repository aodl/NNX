import { PROPOSAL_ISSUE_CODES } from './issue-codes.js';

export const VOTE_READINESS = Object.freeze({
  READY: 'ready',
  NEEDS_MANUAL_REVIEW: 'needs_manual_review',
  UNSUPPORTED: 'unsupported',
  MISLEADING: 'misleading',
  BUG_SUSPECTED: 'bug_suspected',
});

export function classifyVoteReadiness(analysis) {
  if (!analysis) return VOTE_READINESS.NEEDS_MANUAL_REVIEW;
  const issues = analysis.issues ?? [];
  const unsupported = analysis.actionKind === 'Unsupported'
    && issues.some((issue) => issue.code === PROPOSAL_ISSUE_CODES.UNSUPPORTED_PROPOSAL_ANALYSIS);
  const misleading = issues.some((issue) => (
    issue.lifecycle === 'pre_execution' && analysis.lifecycle !== 'pre_execution'
  ));
  const critical = issues.some((issue) => issue.severity === 'critical');
  const manual = issues.some((issue) => issue.severity === 'manual_review')
    || (analysis.dataWarnings ?? []).length > 0;
  const parserOk = ['high', 'medium'].includes(analysis.confidence);

  if (misleading) return VOTE_READINESS.MISLEADING;
  if (critical) return VOTE_READINESS.BUG_SUSPECTED;
  if (unsupported) return VOTE_READINESS.UNSUPPORTED;
  if (!parserOk || manual) return VOTE_READINESS.NEEDS_MANUAL_REVIEW;
  return VOTE_READINESS.READY;
}

export function readinessLabel(readiness) {
  return {
    ready: 'Review-ready',
    needs_manual_review: 'Needs manual review',
    unsupported: 'Unsupported action',
    misleading: 'Misleading analysis suspected',
    bug_suspected: 'Bug suspected',
  }[readiness] ?? 'Needs manual review';
}

export function readinessDescription(readiness) {
  return {
    ready: 'NNX found no critical, warning, manual-review, or parser blockers for this supported action.',
    needs_manual_review: 'Reviewers should inspect parser confidence, data warnings, or manual-review findings before voting.',
    unsupported: 'NNX has not implemented deterministic analysis for this action type yet.',
    misleading: 'The issue lifecycle appears to contradict the proposal lifecycle and may mislead reviewers.',
    bug_suspected: 'A critical analyzer issue is present and should be fixed before relying on the page.',
  }[readiness] ?? 'Reviewers should inspect this proposal manually.';
}

export function readinessSeverity(readiness) {
  return {
    ready: 'info',
    needs_manual_review: 'manual_review',
    unsupported: 'manual_review',
    misleading: 'critical',
    bug_suspected: 'critical',
  }[readiness] ?? 'manual_review';
}

export function recommendedReviewerAction(analysis, readiness = classifyVoteReadiness(analysis)) {
  if (readiness === VOTE_READINESS.MISLEADING) return 'Do not rely on this analysis until lifecycle handling is fixed.';
  if (readiness === VOTE_READINESS.BUG_SUSPECTED) return 'Capture a fixture and fix the analyzer before treating this as review-ready.';
  if (readiness === VOTE_READINESS.UNSUPPORTED) return 'Use the proposal payload and supporting material manually; capture a fixture for analyzer work.';
  if (analysis?.confidence === 'low') return 'Review parsed fields manually because parser confidence is low.';
  if ((analysis?.dataWarnings ?? []).length > 0 || analysis?.summary?.manualReviewCount > 0) {
    return 'Inspect manual-review items and missing evidence before voting.';
  }
  return 'Review analyzer evidence and proposal payload normally.';
}

