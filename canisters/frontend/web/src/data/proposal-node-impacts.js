import { normalizePrincipalText } from './query/principal-text.js';
import { proposalPayloadText } from './proposal-subnet-impacts.js';

const PRINCIPAL_PATTERN = /\b[a-z0-9]{5}(?:-[a-z0-9]{2,5})+\b/g;
const MAX_NODE_CANDIDATES = 80;

function normalizeIntentFromName(name) {
  const lower = String(name ?? '').toLowerCase();
  if (lower.includes('remove')) return 'remove';
  if (lower.includes('add')) return 'add';
  return null;
}

function validPrincipalText(value) {
  return normalizePrincipalText(value);
}

function extractPrincipalCandidates(text) {
  const candidates = [];
  for (const match of String(text ?? '').matchAll(PRINCIPAL_PATTERN)) {
    const principal = validPrincipalText(match[0]);
    if (principal) candidates.push(principal);
  }
  return candidates;
}

function mergeCandidate(candidatesByNodeId, nodeId, intent = null, sourceName = null) {
  const existing = candidatesByNodeId.get(nodeId);
  if (!existing) {
    candidatesByNodeId.set(nodeId, { nodeId, intent, sourceNames: sourceName ? [sourceName] : [] });
    return;
  }
  if (intent === 'remove' || (intent === 'add' && existing.intent !== 'remove')) {
    existing.intent = intent;
  }
  if (sourceName && !existing.sourceNames.includes(sourceName)) {
    existing.sourceNames.push(sourceName);
  }
}

export function referencedNodeCandidatesForProposal(proposal) {
  const candidatesByNodeId = new Map();

  for (const item of proposal?.actionValues ?? []) {
    const intent = normalizeIntentFromName(item?.name);
    const text = [item?.name, item?.value].filter(Boolean).join('\n');
    for (const nodeId of extractPrincipalCandidates(text)) {
      mergeCandidate(candidatesByNodeId, nodeId, intent, item?.name ?? null);
    }
  }

  for (const nodeId of extractPrincipalCandidates(proposalPayloadText(proposal))) {
    mergeCandidate(candidatesByNodeId, nodeId);
  }

  return [...candidatesByNodeId.values()].slice(0, MAX_NODE_CANDIDATES);
}

export function nodeIntentLabel(intent) {
  if (intent === 'add') return 'Proposal intends to add this node';
  if (intent === 'remove') return 'Proposal intends to remove this node';
  return null;
}

export function applyNodeProposalIntents(nodeLocations, candidates) {
  const intentByNodeId = new Map((candidates ?? []).map((candidate) => [candidate.nodeId, candidate.intent]));
  return (nodeLocations ?? []).map((location) => ({
    ...location,
    proposalIntent: intentByNodeId.get(location.nodeId) ?? location.proposalIntent ?? null,
  }));
}

export function mergeNodeLocationsByNodeId(locationLists) {
  const byNodeId = new Map();
  for (const location of locationLists.flat()) {
    if (!location?.nodeId) continue;
    const existing = byNodeId.get(location.nodeId);
    if (!existing) {
      byNodeId.set(location.nodeId, { ...location });
      continue;
    }
    if (location.proposalIntent === 'remove' || (
      location.proposalIntent === 'add' && existing.proposalIntent !== 'remove'
    )) {
      existing.proposalIntent = location.proposalIntent;
    }
    if (!existing.gps && location.gps) {
      byNodeId.set(location.nodeId, { ...location, proposalIntent: existing.proposalIntent ?? location.proposalIntent });
    }
  }
  return [...byNodeId.values()];
}
