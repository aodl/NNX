export function labelizeIdentifier(value) {
  if (typeof value !== 'string' || value.length === 0) return 'Unknown';
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export const SPECIAL_SUBNET_LABELS = Object.freeze({
  'tdb26-jop6k-aogll-7ltgs-eruif-6kk7m-qpktf-gdiqx-mxtrf-vb5e6-eqe': 'NNS',
  'uzr34-akd3s-xrdag-3ql62-ocgoh-ld2ao-tamcv-54e7j-krwgb-2gm4z-oqe': 'II',
  'w4rem-dv5e3-widiz-wbpea-kbttk-mnzfm-tzrc7-svcj3-kbxyb-zamch-hqe': 'Bitcoin',
  'x33ed-h457x-bsgyx-oqxqf-6pzwv-wkhzr-rm2j3-npodi-purzm-n66cg-gae': 'SNS',
});

export function specialSubnetLabel(subnetId) {
  return SPECIAL_SUBNET_LABELS[subnetId] ?? null;
}

const SUBNET_TYPE_SORT_ORDER = Object.freeze({
  cloud_engine: 0,
  verified_application: 1,
  application: 2,
});

function subnetTypeSortIndex(type) {
  return SUBNET_TYPE_SORT_ORDER[type] ?? Number.MAX_SAFE_INTEGER;
}

function sortSubnetsForGroup(left, right) {
  const leftIsSpecial = Boolean(left.cmcLabel);
  const rightIsSpecial = Boolean(right.cmcLabel);
  if (leftIsSpecial !== rightIsSpecial) return leftIsSpecial ? -1 : 1;

  const leftIsPrivate = left.visibility === 'private';
  const rightIsPrivate = right.visibility === 'private';
  if (leftIsPrivate !== rightIsPrivate) return leftIsPrivate ? -1 : 1;

  const typeComparison = subnetTypeSortIndex(left.type) - subnetTypeSortIndex(right.type);
  if (typeComparison !== 0) return typeComparison;

  return left.id.localeCompare(right.id);
}

export function groupSubnetsByNodeCount(subnets) {
  const byNodeCount = new Map();
  for (const subnet of subnets) {
    const nodeCount = Number(subnet.nodeCount) || 0;
    let group = byNodeCount.get(nodeCount);
    if (!group) {
      group = { nodeCount, subnets: [] };
      byNodeCount.set(nodeCount, group);
    }
    group.subnets.push(subnet);
  }

  return [...byNodeCount.values()]
    .sort((left, right) => right.nodeCount - left.nodeCount)
    .map((group) => ({
      ...group,
      subnets: [...group.subnets].sort(sortSubnetsForGroup),
    }));
}

export function subnetVisibility(subnet, publicSubnetIds = []) {
  return publicSubnetIds.includes(subnet?.id) ? 'public' : 'private';
}

export function subnetVisibilityLabel(visibility) {
  if (visibility === 'public') return 'Permissionless';
  return 'Unknown';
}

export function attachCmcLabels(subnets, labelsBySubnetId, publicSubnetIds) {
  return subnets.map((subnet) => ({
    ...subnet,
    registryTypeLabel: labelizeIdentifier(subnet.type),
    visibility: subnetVisibility(subnet, publicSubnetIds),
    visibilityLabel: subnetVisibilityLabel(subnetVisibility(subnet, publicSubnetIds)),
    cmcLabel: labelsBySubnetId[subnet.id] ?? specialSubnetLabel(subnet.id),
  }));
}

function locationKey(location) {
  if (!location?.gps) return `unknown:${location?.nodeId ?? ''}`;
  return [
    location.dataCenterId ?? 'unknown',
    location.gps.latitude,
    location.gps.longitude,
  ].join(':');
}

export function groupNodeLocations(nodeLocations) {
  const groupsByKey = new Map();
  for (const location of nodeLocations ?? []) {
    const key = locationKey(location);
    let group = groupsByKey.get(key);
    if (!group) {
      group = {
        key,
        dataCenterId: location.dataCenterId,
        dataCenterRegion: location.dataCenterRegion,
        dataCenterOwner: location.dataCenterOwner,
        gps: location.gps,
        nodeIds: [],
        nodeOperatorIds: new Set(),
        nodeProviderIds: new Set(),
        proposalIntentCounts: { add: 0, remove: 0, neutral: 0 },
      };
      groupsByKey.set(key, group);
    }
    group.nodeIds.push(location.nodeId);
    if (location.nodeOperatorId) group.nodeOperatorIds.add(location.nodeOperatorId);
    if (location.nodeProviderId) group.nodeProviderIds.add(location.nodeProviderId);
    if (location.proposalIntent === 'add') {
      group.proposalIntentCounts.add += 1;
    } else if (location.proposalIntent === 'remove') {
      group.proposalIntentCounts.remove += 1;
    } else {
      group.proposalIntentCounts.neutral += 1;
    }
  }

  return [...groupsByKey.values()]
    .map((group) => ({
      ...group,
      nodeOperatorIds: [...group.nodeOperatorIds].sort(),
      nodeProviderIds: [...group.nodeProviderIds].sort(),
      nodeCount: group.nodeIds.length,
      proposalIntent: group.proposalIntentCounts.remove > 0
        ? 'remove'
        : (group.proposalIntentCounts.add > 0 ? 'add' : null),
    }))
    .sort((left, right) => {
      if (left.gps && !right.gps) return -1;
      if (!left.gps && right.gps) return 1;
      if (right.nodeCount !== left.nodeCount) return right.nodeCount - left.nodeCount;
      return (left.dataCenterId ?? '').localeCompare(right.dataCenterId ?? '');
    });
}

export function createSubnetLoader({ queryFacade }) {
  async function loadSubnetGroups() {
    const [subnetResult, cmcResult] = await Promise.all([
      queryFacade.getIcSubnets(),
      queryFacade.getCmcSubnetLabels(),
    ]);
    const warnings = [
      ...(subnetResult?.warnings ?? []),
      ...(cmcResult?.warnings ?? []),
    ];
    const subnets = attachCmcLabels(
      subnetResult?.subnets ?? [],
      cmcResult?.labelsBySubnetId ?? {},
      cmcResult?.publicSubnetIds ?? [],
    );

    return {
      groups: groupSubnetsByNodeCount(subnets),
      subnets,
      warnings,
    };
  }

  async function loadSubnetDetails(subnetId) {
    const [detailResult, cmcResult] = await Promise.all([
      queryFacade.getIcSubnetDetails({ subnetId }),
      queryFacade.getCmcSubnetLabels(),
    ]);
    const warnings = [
      ...(detailResult?.warnings ?? []),
      ...(cmcResult?.warnings ?? []),
    ];
    const [subnet] = attachCmcLabels(
      detailResult?.subnet ? [detailResult.subnet] : [],
      cmcResult?.labelsBySubnetId ?? {},
      cmcResult?.publicSubnetIds ?? [],
    );
    const nodeLocations = detailResult?.nodeLocations ?? [];

    return {
      subnet: subnet ?? null,
      nodeLocations,
      locationGroups: groupNodeLocations(nodeLocations),
      warnings,
    };
  }

  return Object.freeze({ loadSubnetGroups, loadSubnetDetails });
}
