export const NODE_HEALTH_SIGNALS = Object.freeze({
  HEALTHY: 'healthy_signal',
  ELEVATED_FAILURE: 'elevated_failure_signal',
  INACTIVE_OR_NO_BLOCK: 'inactive_or_no_block_signal',
  INSUFFICIENT_DATA: 'insufficient_data',
  UNAVAILABLE: 'unavailable',
});

export const DEFAULT_NODE_HEALTH_POLICY = Object.freeze({
  insufficientSampleSize: 3,
  elevatedFailureCount: 3,
  elevatedFailureRate: 0.10,
  elevatedFailureRateMinSampleSize: 10,
});
