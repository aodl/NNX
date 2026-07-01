const LABELS = Object.freeze({
  healthy_signal: 'Healthy signal',
  elevated_failure_signal: 'Elevated failure signal',
  inactive_or_no_block_signal: 'Inactive/no-block signal',
  insufficient_data: 'Insufficient data',
  unavailable: 'Unavailable',
  pre_execution: 'Pre-execution',
  post_execution_success: 'Post-execution',
  post_execution_failed: 'Failed execution',
  rejected: 'Rejected',
  manual_review: 'Manual review',
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  unsupported: 'Unsupported',
  unknown: 'Unknown',
});

export function humanLabel(value, fallback = 'Unknown') {
  if (value === null || value === undefined || value === '') return fallback;
  const key = String(value);
  return LABELS[key] ?? key
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function lifecycleLabel(value) {
  return humanLabel(value);
}

export function severityLabel(value) {
  return humanLabel(value);
}

export function nodeMetricSignalLabel(value) {
  return humanLabel(value);
}

