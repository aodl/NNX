import { DEFAULT_NODE_HEALTH_POLICY, NODE_HEALTH_SIGNALS } from './node-health-policy.js';

function counterDelta(records, field) {
  let delta = 0n;
  let counterResetObserved = false;
  for (let index = 1; index < records.length; index += 1) {
    const previous = BigInt(records[index - 1]?.[field] ?? 0);
    const current = BigInt(records[index]?.[field] ?? 0);
    if (current >= previous) {
      delta += current - previous;
    } else {
      counterResetObserved = true;
      delta += current;
    }
  }
  return { delta: Number(delta), counterResetObserved };
}

export function deriveNodeHealthMetrics({
  nodeId,
  records,
  windowHours,
  otherSubnetNodesHaveRecords = false,
  policy = DEFAULT_NODE_HEALTH_POLICY,
}) {
  const ordered = [...(records ?? [])].sort((a, b) => Number(a.timestampNanos) - Number(b.timestampNanos));
  const proposed = counterDelta(ordered, 'numBlocksProposedTotal');
  const failed = counterDelta(ordered, 'numBlockFailuresTotal');
  const proposedDelta = proposed.delta;
  const failedDelta = failed.delta;
  const sampleSize = proposedDelta + failedDelta;
  const failureRate = sampleSize === 0 ? 0 : failedDelta / sampleSize;
  const sampleCount = ordered.length;
  const counterResetObserved = proposed.counterResetObserved || failed.counterResetObserved;
  const firstTimestampNanos = ordered[0]?.timestampNanos ?? null;
  const lastTimestampNanos = ordered[ordered.length - 1]?.timestampNanos ?? null;

  let healthSignal = NODE_HEALTH_SIGNALS.HEALTHY;
  if (sampleCount === 0) {
    healthSignal = otherSubnetNodesHaveRecords
      ? NODE_HEALTH_SIGNALS.INACTIVE_OR_NO_BLOCK
      : NODE_HEALTH_SIGNALS.UNAVAILABLE;
  } else if (
    sampleCount >= 2
    && proposedDelta === 0
    && otherSubnetNodesHaveRecords
  ) {
    healthSignal = NODE_HEALTH_SIGNALS.INACTIVE_OR_NO_BLOCK;
  } else if (sampleCount === 1 || sampleSize < policy.insufficientSampleSize) {
    healthSignal = NODE_HEALTH_SIGNALS.INSUFFICIENT_DATA;
  } else if (
    failedDelta >= policy.elevatedFailureCount
    || (failureRate >= policy.elevatedFailureRate && sampleSize >= policy.elevatedFailureRateMinSampleSize)
  ) {
    healthSignal = NODE_HEALTH_SIGNALS.ELEVATED_FAILURE;
  }

  return {
    nodeId,
    windowHours,
    firstTimestampNanos,
    lastTimestampNanos,
    proposedDelta,
    failedDelta,
    failureRate,
    sampleSize,
    sampleCount,
    counterResetObserved,
    healthSignal,
  };
}

export function summarizeNodeHealthSignals(metrics = []) {
  const counts = Object.fromEntries(Object.values(NODE_HEALTH_SIGNALS).map((signal) => [signal, 0]));
  for (const item of metrics) {
    if (counts[item?.healthSignal] !== undefined) counts[item.healthSignal] += 1;
  }
  return counts;
}
