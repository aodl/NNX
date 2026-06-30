export const ISSUE_SEVERITIES = Object.freeze(['critical', 'warning', 'info', 'manual_review']);

export function createIssue({
  code,
  severity = 'warning',
  lifecycle = 'unknown',
  title,
  message,
  proposalId = null,
  actionKind = null,
  affected = {},
  evidence = [],
  confidence = 'high',
}) {
  return Object.freeze({
    code,
    severity,
    lifecycle,
    title,
    message,
    proposalId,
    actionKind,
    affected: {
      proposalIds: [],
      subnetIds: [],
      nodeIds: [],
      nodeProviderIds: [],
      nodeOperatorIds: [],
      dataCenterIds: [],
      ...affected,
    },
    evidence,
    confidence,
  });
}

export function summarizeIssues(issues = []) {
  const summary = {
    criticalCount: 0,
    warningCount: 0,
    infoCount: 0,
    manualReviewCount: 0,
  };
  for (const issue of issues) {
    if (issue?.severity === 'critical') summary.criticalCount += 1;
    else if (issue?.severity === 'warning') summary.warningCount += 1;
    else if (issue?.severity === 'info') summary.infoCount += 1;
    else if (issue?.severity === 'manual_review') summary.manualReviewCount += 1;
  }
  return summary;
}

export function groupIssuesBySeverity(issues = []) {
  const groups = {
    critical: [],
    warning: [],
    info: [],
    manual_review: [],
  };
  for (const issue of issues) {
    if (groups[issue?.severity]) groups[issue.severity].push(issue);
  }
  return groups;
}

export function proposalLifecycle(proposal) {
  const statusKind = String(proposal?.statusKind ?? proposal?.statusLabel ?? '').toLowerCase();
  const rewardStatusKind = String(proposal?.rewardStatusKind ?? proposal?.rewardStatusLabel ?? '').toLowerCase();
  const status = Number(proposal?.status);

  if (statusKind === 'open' || rewardStatusKind === 'accepting-votes' || status === 1) {
    return 'pre_execution';
  }
  if (statusKind === 'adopted' || status === 3) return 'pre_execution';
  if (statusKind === 'executed' || status === 4) return 'post_execution_success';
  if (statusKind === 'failed' || status === 5) return 'post_execution_failed';
  if (statusKind === 'rejected' || status === 2) return 'rejected';
  return 'unknown';
}

export function createEmptyAnalysis({ proposalId = null, intent = null, lifecycle = 'unknown' } = {}) {
  return {
    proposalId,
    actionKind: intent?.actionKind ?? 'Unsupported',
    lifecycle,
    confidence: intent?.confidence ?? 'low',
    summary: summarizeIssues([]),
    intent,
    stateChange: {
      beforeNodeIds: [],
      afterNodeIds: [],
      currentNodeIds: [],
      addedNodeIds: [],
      removedNodeIds: [],
      unchangedNodeIds: [],
    },
    issues: [],
    metrics: {
      diversity: null,
      concentration: null,
      distance: null,
      dfinityProvider: null,
    },
    dataWarnings: [],
  };
}
