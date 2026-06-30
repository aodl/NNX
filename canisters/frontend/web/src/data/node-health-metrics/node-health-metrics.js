import { NODE_HEALTH_SIGNALS } from './node-health-policy.js';
import { deriveNodeHealthMetrics, summarizeNodeHealthSignals } from './node-health-signals.js';

function unavailableMetric(nodeId, windowHours) {
  return {
    nodeId,
    windowHours,
    firstTimestampNanos: null,
    lastTimestampNanos: null,
    proposedDelta: 0,
    failedDelta: 0,
    failureRate: 0,
    sampleSize: 0,
    sampleCount: 0,
    counterResetObserved: false,
    healthSignal: NODE_HEALTH_SIGNALS.UNAVAILABLE,
  };
}

export function groupMetricRecordsByNode(records = []) {
  const byNode = new Map();
  for (const record of records) {
    if (!record?.nodeId) continue;
    const list = byNode.get(record.nodeId) ?? [];
    list.push(record);
    byNode.set(record.nodeId, list);
  }
  return byNode;
}

export async function getSubnetNodeHealthMetrics({
  queryFacade,
  subnetId,
  nodeIds,
  startAtTimestampNanos,
  endAtTimestampNanos,
  windowHours = 24,
}) {
  if (!queryFacade?.getNodeMetricsHistory) {
    return {
      subnetId,
      windowHours,
      metrics: (nodeIds ?? []).map((nodeId) => unavailableMetric(nodeId, windowHours)),
      summary: {},
      partial: true,
      errors: [{ code: 'NODE_METRICS_UNAVAILABLE', message: 'Node metrics proxy is not configured.' }],
    };
  }

  let response;
  try {
    response = await queryFacade.getNodeMetricsHistory({
      subnetId,
      startAtTimestampNanos,
      endAtTimestampNanos,
      windowHours,
    });
  } catch (error) {
    return {
      subnetId,
      windowHours,
      metrics: (nodeIds ?? []).map((nodeId) => unavailableMetric(nodeId, windowHours)),
      summary: {},
      partial: true,
      errors: [{ code: 'NODE_METRICS_UNAVAILABLE', message: error?.message ?? String(error) }],
    };
  }

  const byNode = groupMetricRecordsByNode(response.records);
  const otherSubnetNodesHaveRecords = byNode.size > 0;
  const metrics = (nodeIds ?? []).map((nodeId) => deriveNodeHealthMetrics({
    nodeId,
    records: byNode.get(nodeId) ?? [],
    windowHours,
    otherSubnetNodesHaveRecords,
  }));

  return {
    subnetId,
    windowHours,
    metrics,
    summary: summarizeNodeHealthSignals(metrics),
    partial: Boolean(response.partial),
    errors: response.errors ?? [],
  };
}
