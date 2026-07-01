import { normalizePrincipalText } from '../data/query/principal-text.js';

const MAX_NAT64 = (1n << 64n) - 1n;

function isPrincipalText(value) {
  return normalizePrincipalText(value) === value;
}

export function parseRoute(pathname) {
  if (pathname === '/') {
    return { kind: 'home' };
  }

  if (pathname === '/review') {
    return { kind: 'review' };
  }

  if (pathname === '/data-sources') {
    return { kind: 'data_sources' };
  }

  const parts = pathname.split('/').filter(Boolean);
  if (parts.length !== 2 || !['neuron', 'proposal', 'subnet'].includes(parts[0])) {
    return { kind: 'not_found' };
  }

  const id = parts[1];
  if (parts[0] === 'subnet') {
    return isPrincipalText(id) ? { kind: 'subnet', subnetId: id } : { kind: 'not_found' };
  }

  if (!/^(0|[1-9][0-9]*)$/.test(id)) {
    return { kind: 'not_found' };
  }

  const neuronId = BigInt(id);
  if (neuronId > MAX_NAT64) {
    return { kind: 'not_found' };
  }

  if (parts[0] === 'proposal') {
    return { kind: 'proposal', proposalId: neuronId };
  }

  return { kind: 'neuron', neuronId };
}
