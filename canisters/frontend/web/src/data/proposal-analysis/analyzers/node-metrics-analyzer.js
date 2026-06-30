import { NODE_HEALTH_SIGNALS } from '../../node-health-metrics/node-health-policy.js';
import { PROPOSAL_ISSUE_CODES } from '../issue-codes.js';
import { createIssue } from '../proposal-analysis-types.js';

function common(context) {
  return {
    proposalId: context.intent.proposalId,
    actionKind: context.intent.actionKind,
    lifecycle: context.lifecycle,
  };
}

export const nodeMetricsAnalyzer = Object.freeze({
  id: 'node-metrics',
  supports(intent) {
    return intent.actionKind === 'RemoveNodesFromSubnet';
  },
  analyze(context) {
    const metricsResult = context.analysisContext.nodeHealthMetrics ?? null;
    const byNode = context.analysisContext.nodeHealthMetricsByNodeId ?? {};
    const issues = [];
    const base = common(context);

    if (!metricsResult || metricsResult.errors?.length) {
      issues.push(createIssue({
        ...base,
        code: PROPOSAL_ISSUE_CODES.NODE_METRICS_UNAVAILABLE,
        severity: 'manual_review',
        title: 'Node metrics unavailable',
        message: 'NNX could not read node metrics for the selected window.',
        affected: { nodeIds: context.intent.removeNodeIds },
        confidence: 'medium',
      }));
      return { issues, metrics: { nodeHealth: metricsResult ?? null }, dataWarnings: [] };
    }

    for (const nodeId of context.intent.removeNodeIds) {
      const metric = byNode[nodeId] ?? null;
      if (!metric || metric.healthSignal === NODE_HEALTH_SIGNALS.UNAVAILABLE) {
        issues.push(createIssue({
          ...base,
          code: PROPOSAL_ISSUE_CODES.NODE_METRICS_UNAVAILABLE,
          severity: 'manual_review',
          title: 'Node metrics unavailable',
          message: 'NNX could not read usable node metrics for this node in the selected window.',
          affected: { nodeIds: [nodeId] },
          confidence: 'medium',
        }));
      } else if (metric.healthSignal === NODE_HEALTH_SIGNALS.INSUFFICIENT_DATA) {
        issues.push(createIssue({
          ...base,
          code: PROPOSAL_ISSUE_CODES.NODE_METRICS_INSUFFICIENT_DATA,
          severity: 'manual_review',
          title: 'Node metrics have insufficient data',
          message: 'The selected node metrics window does not include enough samples for a failure signal.',
          affected: { nodeIds: [nodeId] },
          evidence: [metric],
          confidence: 'medium',
        }));
      } else if (metric.healthSignal === NODE_HEALTH_SIGNALS.ELEVATED_FAILURE) {
        issues.push(createIssue({
          ...base,
          code: PROPOSAL_ISSUE_CODES.REMOVE_NODE_HAS_ELEVATED_FAILURE_SIGNAL,
          severity: 'info',
          title: 'Elevated failure signal observed',
          message: 'NNX observed an elevated failure signal in the selected window.',
          affected: { nodeIds: [nodeId] },
          evidence: [metric],
        }));
      } else {
        issues.push(createIssue({
          ...base,
          code: PROPOSAL_ISSUE_CODES.REMOVE_NODE_HAS_NO_ELEVATED_FAILURE_SIGNAL,
          severity: 'info',
          title: 'No elevated failure signal observed',
          message: 'NNX did not observe an elevated failure signal in the selected window.',
          affected: { nodeIds: [nodeId] },
          evidence: [metric],
        }));
      }
    }

    issues.push(createIssue({
      ...base,
      code: PROPOSAL_ISSUE_CODES.SUBNET_NODE_FAILURE_SIGNAL_SUMMARY,
      severity: 'info',
      title: 'Subnet node signal summary',
      message: `Derived node-health signals use a ${metricsResult.windowHours}-hour window and are not canonical node status.`,
      affected: { subnetIds: [metricsResult.subnetId].filter(Boolean) },
      evidence: [metricsResult.summary ?? {}],
    }));

    return { issues, metrics: { nodeHealth: metricsResult }, dataWarnings: [] };
  },
});
