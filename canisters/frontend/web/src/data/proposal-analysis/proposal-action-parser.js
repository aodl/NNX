import { Principal } from '@icp-sdk/core/principal';

const PRINCIPAL_PATTERN = /\b[a-z0-9]{5}(?:-[a-z0-9]{2,5})+\b/g;

function proposalIdValue(proposal) {
  const id = proposal?.id ?? proposal?.proposalId ?? null;
  return id === null || id === undefined ? null : BigInt(id);
}

function unique(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (typeof value !== 'string' || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function principalText(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  try {
    return Principal.fromText(value).toText();
  } catch {
    return null;
  }
}

function principalsFromText(text) {
  const result = [];
  for (const match of String(text ?? '').matchAll(PRINCIPAL_PATTERN)) {
    const principal = principalText(match[0]);
    if (principal) result.push(principal);
  }
  return unique(result);
}

function actionText(proposal) {
  return [
    proposal?.actionTypeName,
    proposal?.actionDescription,
    proposal?.actionDetails,
    ...(proposal?.actionValues ?? []).flatMap((item) => [item?.name, item?.value]),
  ]
    .filter((part) => typeof part === 'string' && part.trim().length > 0)
    .join('\n');
}

function payloadText(proposal) {
  return [
    actionText(proposal),
    proposal?.payloadSearchText,
  ]
    .filter((part) => typeof part === 'string' && part.trim().length > 0)
    .join('\n');
}

function normalizeActionKind(name) {
  const lower = String(name ?? '').toLowerCase();
  if (lower.includes('change') && lower.includes('subnet') && lower.includes('membership')) {
    return 'ChangeSubnetMembership';
  }
  if (lower.includes('create') && lower.includes('subnet')) return 'CreateSubnet';
  if (lower.includes('remove') && lower.includes('nodes') && lower.includes('subnet')) {
    return 'RemoveNodesFromSubnet';
  }
  if (lower.includes('add') && lower.includes('api') && lower.includes('boundary')) {
    return 'AddApiBoundaryNodes';
  }
  if (lower.includes('remove') && lower.includes('api') && lower.includes('boundary')) {
    return 'RemoveApiBoundaryNodes';
  }
  if (lower === 'addnodes' || lower.includes('add nodes')) return 'ChangeSubnetMembership';
  if (lower === 'removenodes' || lower.includes('remove nodes')) return 'RemoveNodesFromSubnet';
  return 'Unsupported';
}

function namedValuePrincipals(proposal, namePattern) {
  const values = [];
  for (const item of proposal?.actionValues ?? []) {
    const name = String(item?.name ?? '');
    if (namePattern.test(name)) {
      values.push(...principalsFromText([name, item?.value].filter(Boolean).join('\n')));
    }
  }
  return unique(values);
}

function subnetIdsFromStructuredValues(proposal) {
  return unique([
    ...namedValuePrincipals(proposal, /subnet/i),
    ...namedValuePrincipals(proposal, /target/i),
  ]);
}

function nodeIdsFromStructuredValues(proposal) {
  return unique(namedValuePrincipals(proposal, /node/i));
}

function classifyAddRemove(proposal, fallbackNodeIds = []) {
  const addNodeIds = namedValuePrincipals(proposal, /add|new|membership/i);
  const removeNodeIds = namedValuePrincipals(proposal, /remove|deleted/i);
  if (addNodeIds.length || removeNodeIds.length) {
    return { addNodeIds, removeNodeIds };
  }
  return { addNodeIds: fallbackNodeIds, removeNodeIds: [] };
}

export function parseProposalIntent(proposal) {
  const warnings = [];
  const proposalId = proposalIdValue(proposal);
  const typeText = [
    proposal?.actionKind,
    proposal?.actionTypeName,
    proposal?.actionDescription,
  ].filter(Boolean).join('\n');
  const actionKind = normalizeActionKind(typeText || payloadText(proposal));
  const structuredPrincipals = nodeIdsFromStructuredValues(proposal);
  const fallbackPrincipals = principalsFromText(proposal?.payloadSearchText ?? '');
  const referencedSubnetIds = subnetIdsFromStructuredValues(proposal);
  const fallbackOnly = structuredPrincipals.length === 0 && referencedSubnetIds.length === 0;

  let addNodeIds = [];
  let removeNodeIds = [];
  let targetSubnetId = referencedSubnetIds[0] ?? null;
  let createsNewSubnet = false;
  let isApiBoundaryAction = false;
  let confidence = fallbackOnly ? 'low' : 'high';

  if (actionKind === 'ChangeSubnetMembership') {
    ({ addNodeIds, removeNodeIds } = classifyAddRemove(proposal, fallbackPrincipals));
  } else if (actionKind === 'CreateSubnet') {
    createsNewSubnet = true;
    addNodeIds = structuredPrincipals.length ? structuredPrincipals : fallbackPrincipals;
    targetSubnetId = null;
  } else if (actionKind === 'RemoveNodesFromSubnet') {
    removeNodeIds = structuredPrincipals.length ? structuredPrincipals : fallbackPrincipals;
  } else if (actionKind === 'AddApiBoundaryNodes') {
    isApiBoundaryAction = true;
    addNodeIds = structuredPrincipals.length ? structuredPrincipals : fallbackPrincipals;
  } else if (actionKind === 'RemoveApiBoundaryNodes') {
    isApiBoundaryAction = true;
    removeNodeIds = structuredPrincipals.length ? structuredPrincipals : fallbackPrincipals;
  } else {
    confidence = 'low';
  }

  if (fallbackOnly && fallbackPrincipals.length > 0) {
    warnings.push('Parsed principal references from free text fallback.');
  }
  if (actionKind !== 'Unsupported' && addNodeIds.length === 0 && removeNodeIds.length === 0) {
    confidence = 'low';
    warnings.push('Proposal action did not include node IDs that NNX could identify.');
  }

  const allNodeIds = unique([...addNodeIds, ...removeNodeIds]);
  const allReferencedSubnets = unique([
    ...(targetSubnetId ? [targetSubnetId] : []),
    ...referencedSubnetIds,
  ].filter((id) => !allNodeIds.includes(id)));

  return {
    proposalId,
    actionKind,
    targetSubnetId,
    createsNewSubnet,
    isApiBoundaryAction,
    addNodeIds: unique(addNodeIds),
    removeNodeIds: unique(removeNodeIds),
    allNodeIds,
    referencedSubnetIds: allReferencedSubnets,
    confidence,
    parseWarnings: warnings,
  };
}
