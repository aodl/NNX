import { getSubnetNodeHealthMetrics } from '../node-health-metrics/node-health-metrics.js';

function toObjectById(items = []) {
  return Object.fromEntries(items.filter((item) => item?.id).map((item) => [item.id, item]));
}

function subnetListFromResult(result) {
  if (Array.isArray(result)) return result;
  return result?.subnets ?? [];
}

export function findCurrentSubnetsForNode(nodeId, allSubnets = []) {
  return allSubnets
    .filter((subnet) => (subnet.nodeIds ?? subnet.membership ?? []).includes(nodeId))
    .map((subnet) => subnet.id);
}

export function findCurrentSubnetForNode(nodeId, allSubnets = []) {
  const subnetIds = findCurrentSubnetsForNode(nodeId, allSubnets);
  if (subnetIds.length === 1) return { status: 'assigned', subnetId: subnetIds[0], subnetIds };
  if (subnetIds.length === 0) return { status: 'unassigned', subnetId: null, subnetIds };
  return { status: 'ambiguous', subnetId: null, subnetIds };
}

export function resolveEffectiveTargetSubnetId(intent, allSubnets = []) {
  if (!intent) return null;
  if (intent.createsNewSubnet && !intent.targetSubnetId) return null;
  if (intent.targetSubnetId) return intent.targetSubnetId;
  if (intent.actionKind !== 'RemoveNodesFromSubnet' || intent.removeNodeIds.length === 0) {
    return null;
  }

  let effectiveTargetSubnetId = null;
  for (const nodeId of intent.removeNodeIds) {
    const current = findCurrentSubnetForNode(nodeId, allSubnets);
    if (current.status !== 'assigned') return null;
    if (effectiveTargetSubnetId && effectiveTargetSubnetId !== current.subnetId) return null;
    effectiveTargetSubnetId = current.subnetId;
  }

  return effectiveTargetSubnetId;
}

export async function loadProposalAnalysisBaseContext({
  queryFacade,
  openProposals = null,
} = {}) {
  const warnings = [];
  const [openResult, subnetResult, topologyResult, cmcResult] = await Promise.allSettled([
    openProposals ? Promise.resolve(openProposals) : queryFacade.getOpenNnsProposals(),
    queryFacade.getIcSubnets(),
    queryFacade.getIcTopology(),
    queryFacade.getCmcSubnetLabels(),
  ]);

  const normalizedOpenProposals = openResult.status === 'fulfilled' ? openResult.value : [];
  if (openResult.status === 'rejected') warnings.push({ message: 'Open proposals are unavailable.' });
  const allSubnets = subnetResult.status === 'fulfilled' ? subnetListFromResult(subnetResult.value) : [];
  if (subnetResult.status === 'rejected') warnings.push({ message: 'Subnet list is unavailable.' });
  const topology = topologyResult.status === 'fulfilled' ? topologyResult.value : {};
  if (topologyResult.status === 'rejected') warnings.push({ message: 'Topology metadata is unavailable.' });
  const cmcLabels = cmcResult.status === 'fulfilled' ? cmcResult.value : {};
  if (cmcResult.status === 'rejected') warnings.push({ message: 'CMC subnet labels are unavailable.' });
  warnings.push(...(subnetResult.value?.warnings ?? []), ...(topology?.warnings ?? []), ...(cmcLabels?.warnings ?? []));

  return { openProposals: normalizedOpenProposals, allSubnets, topology, cmcLabels, warnings };
}

function nodeFromLocation(location, assignment) {
  return {
    id: location.nodeId ?? location.id,
    nodeId: location.nodeId ?? location.id,
    currentSubnetId: assignment?.subnetId ?? location.currentSubnetId ?? null,
    nodeOperatorId: location.nodeOperatorId ?? null,
    nodeProviderId: location.nodeProviderId ?? null,
    dataCenterId: location.dataCenterId ?? null,
    dataCenterOwner: location.dataCenterOwner ?? null,
    dataCenterRegion: location.dataCenterRegion ?? null,
    normalizedRegion: location.normalizedRegion ?? null,
    normalizedCountryCode: location.normalizedCountryCode ?? null,
    normalizedCountryName: location.normalizedCountryName ?? null,
    normalizedContinent: location.normalizedContinent ?? null,
    gps: location.gps ?? null,
    domain: location.domain ?? null,
    publicIpv4: location.publicIpv4 ?? null,
    httpEndpoint: location.httpEndpoint ?? null,
    xnetEndpoint: location.xnetEndpoint ?? null,
    hostosVersionId: location.hostosVersionId ?? null,
    rewardType: location.rewardType ?? null,
    membershipStatus: assignment?.status ?? 'unknown',
    membershipSubnetIds: assignment?.subnetIds ?? [],
  };
}

export async function loadProposalAnalysisContext({
  queryFacade,
  proposal = null,
  intent = null,
  openProposals = null,
  baseContext = null,
  includeNodeMetrics = true,
} = {}) {
  const base = baseContext ?? await loadProposalAnalysisBaseContext({ queryFacade, openProposals });
  const warnings = [...(base.warnings ?? [])];
  const normalizedOpenProposals = base.openProposals ?? [];
  const allSubnets = base.allSubnets ?? [];
  const topology = base.topology ?? {};
  const cmcLabels = base.cmcLabels ?? {};

  const subnetsById = toObjectById(allSubnets);
  const effectiveTargetSubnetId = resolveEffectiveTargetSubnetId(intent, allSubnets);
  let targetNodeIds = [];
  if (effectiveTargetSubnetId && subnetsById[effectiveTargetSubnetId]) {
    targetNodeIds = subnetsById[effectiveTargetSubnetId].nodeIds ?? [];
  }
  const nodeIdsToLoad = [...new Set([...(intent?.allNodeIds ?? []), ...targetNodeIds])];
  let nodeHealthMetrics = null;
  let nodeHealthMetricsByNodeId = {};
  let apiBoundaryNodeIds = [];
  let apiBoundaryMembershipAvailable = false;

  let nodeDetails = { nodeLocations: [], warnings: [] };
  if (nodeIdsToLoad.length > 0) {
    try {
      nodeDetails = await queryFacade.getIcNodeDetails({ nodeIds: nodeIdsToLoad });
    } catch {
      warnings.push({ message: 'Node Registry records are unavailable.' });
    }
  }
  warnings.push(...(nodeDetails.warnings ?? []));

  const nodesById = {};
  const nodeLocationsByNodeId = {};
  for (const location of nodeDetails.nodeLocations ?? []) {
    const nodeId = location.nodeId ?? location.id;
    const assignment = findCurrentSubnetForNode(nodeId, allSubnets);
    const node = nodeFromLocation(location, assignment);
    nodesById[nodeId] = node;
    nodeLocationsByNodeId[nodeId] = node;
  }

  if (
    includeNodeMetrics
    && effectiveTargetSubnetId
    && targetNodeIds.length > 0
    && intent?.actionKind === 'RemoveNodesFromSubnet'
  ) {
    const endAtTimestampNanos = BigInt(Date.now()) * 1_000_000n;
    const windowHours = 24;
    const startAtTimestampNanos = endAtTimestampNanos - BigInt(windowHours * 60 * 60) * 1_000_000_000n;
    nodeHealthMetrics = await getSubnetNodeHealthMetrics({
      queryFacade,
      subnetId: effectiveTargetSubnetId,
      nodeIds: targetNodeIds,
      startAtTimestampNanos,
      endAtTimestampNanos,
      windowHours,
    });
    nodeHealthMetricsByNodeId = Object.fromEntries(
      (nodeHealthMetrics.metrics ?? []).map((metric) => [metric.nodeId, metric]),
    );
  }

  if (
    (intent?.actionKind === 'AddApiBoundaryNodes' || intent?.actionKind === 'RemoveApiBoundaryNodes')
    && nodeIdsToLoad.length > 0
    && queryFacade?.getApiBoundaryNodeIds
  ) {
    try {
      const membership = await queryFacade.getApiBoundaryNodeIds({ nodeIds: nodeIdsToLoad });
      apiBoundaryNodeIds = membership?.nodeIds ?? membership?.apiBoundaryNodeIds ?? [];
      apiBoundaryMembershipAvailable = Boolean(membership?.available);
      warnings.push(...(membership?.warnings ?? []));
    } catch {
      warnings.push({ message: 'API boundary membership records are unavailable.' });
    }
  }

  return {
    proposal,
    openProposals: normalizedOpenProposals,
    topology,
    subnetsById,
    subnetDetailsById: {},
    effectiveTargetSubnetId,
    nodesById,
    nodeLocationsByNodeId,
    nodeProvidersById: topology?.nodeProvidersById ?? {},
    nodeOperatorsById: topology?.nodeOperatorsById ?? {},
    dataCentersById: topology?.dataCentersById ?? {},
    cmcLabels,
    apiBoundaryNodeIds,
    apiBoundaryMembershipAvailable,
    nodeHealthMetrics,
    nodeHealthMetricsByNodeId,
    warnings,
    allSubnets,
    findCurrentSubnetForNode: (nodeId) => findCurrentSubnetForNode(nodeId, allSubnets),
  };
}
