export function formatNeuronId(id) {
  return typeof id === 'bigint' ? id.toString() : String(id);
}

export function formatPrincipal(principal) {
  if (!principal) return 'Anonymous';
  return typeof principal === 'string' ? principal : principal.toString();
}

export function formatIcpFromE8s(e8s) {
  const value = BigInt(e8s ?? 0);
  const whole = value / 100_000_000n;
  const fractional = value % 100_000_000n;
  const trimmed = fractional.toString().padStart(8, '0').replace(/0+$/, '');
  return `${whole.toString()}${trimmed ? `.${trimmed}` : ''} ICP`;
}

export function formatGuaranteeStatus(status) {
  switch (status) {
    case 'guaranteed':
      return 'Guaranteed';
    case 'not_guaranteed':
      return 'Not guaranteed';
    case 'private':
      return 'Private';
    default:
      return 'Unknown';
  }
}

export function formatTimestampSeconds(seconds) {
  if (seconds === null || seconds === undefined) return 'Deadline unavailable';
  const value = typeof seconds === 'bigint' ? seconds : BigInt(seconds);
  const milliseconds = value * 1000n;
  if (
    milliseconds < -8_640_000_000_000_000n
    || milliseconds > 8_640_000_000_000_000n
  ) {
    return 'Deadline unavailable';
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(Number(milliseconds)));
}

export function formatTimeRemaining(deadlineTimestampSeconds, now = Date.now()) {
  if (deadlineTimestampSeconds === null || deadlineTimestampSeconds === undefined) {
    return 'Deadline unavailable';
  }

  const nowSeconds = BigInt(Math.floor(now / 1000));
  const remainingSeconds = BigInt(deadlineTimestampSeconds) - nowSeconds;
  if (remainingSeconds <= 0n) {
    return 'Deadline reached; finalization pending';
  }

  const days = remainingSeconds / 86_400n;
  const hours = (remainingSeconds % 86_400n) / 3_600n;
  const minutes = (remainingSeconds % 3_600n) / 60n;
  if (days > 0n) {
    return `Voting closes in ${days.toString()}d ${hours.toString()}h`;
  }
  if (hours > 0n) {
    return `Voting closes in ${hours.toString()}h ${minutes.toString()}m`;
  }
  return `Voting closes in ${(minutes > 0n ? minutes : 1n).toString()}m`;
}

export function formatPercent(value) {
  return `${Number(value ?? 0).toFixed(1).replace(/\.0$/, '')}%`;
}

export function formatCompactBigInt(value) {
  const amount = BigInt(value ?? 0n);
  const sign = amount < 0n ? '-' : '';
  const absolute = amount < 0n ? -amount : amount;
  const units = [
    { suffix: 'T', value: 1_000_000_000_000n },
    { suffix: 'B', value: 1_000_000_000n },
    { suffix: 'M', value: 1_000_000n },
    { suffix: 'K', value: 1_000n },
  ];

  for (const unit of units) {
    if (absolute >= unit.value) {
      const tenths = (absolute * 10n) / unit.value;
      const whole = tenths / 10n;
      const decimal = tenths % 10n;
      return `${sign}${whole.toString()}${decimal === 0n ? '' : `.${decimal.toString()}`}${unit.suffix}`;
    }
  }

  return `${sign}${absolute.toString()}`;
}

export function truncateText(text, maxLength) {
  const value = String(text ?? '').trim();
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}
