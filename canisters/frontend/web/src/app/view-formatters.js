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
