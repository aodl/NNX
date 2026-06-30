function unique(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (typeof value !== 'string' || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function without(values, removals) {
  const removeSet = new Set(removals);
  return values.filter((value) => !removeSet.has(value));
}

function addStable(values, additions) {
  return unique([...values, ...additions]);
}

export function simulateProposalStateChange({
  lifecycle,
  currentNodeIds = [],
  addNodeIds = [],
  removeNodeIds = [],
  createsNewSubnet = false,
} = {}) {
  const current = unique(currentNodeIds);
  const add = unique(addNodeIds);
  const remove = unique(removeNodeIds);
  let beforeNodeIds;
  let afterNodeIds;

  if (createsNewSubnet && lifecycle === 'pre_execution') {
    beforeNodeIds = [];
    afterNodeIds = add;
  } else if (createsNewSubnet && lifecycle === 'post_execution_success') {
    beforeNodeIds = [];
    afterNodeIds = current;
  } else if (lifecycle === 'post_execution_success') {
    beforeNodeIds = addStable(without(current, add), remove);
    afterNodeIds = current;
  } else if (lifecycle === 'post_execution_failed' || lifecycle === 'rejected') {
    beforeNodeIds = current;
    afterNodeIds = current;
  } else {
    beforeNodeIds = current;
    afterNodeIds = addStable(without(current, remove), add);
  }

  const beforeSet = new Set(beforeNodeIds);
  const afterSet = new Set(afterNodeIds);
  return {
    currentNodeIds: current,
    beforeNodeIds,
    afterNodeIds,
    addedNodeIds: afterNodeIds.filter((nodeId) => !beforeSet.has(nodeId)),
    removedNodeIds: beforeNodeIds.filter((nodeId) => !afterSet.has(nodeId)),
    unchangedNodeIds: afterNodeIds.filter((nodeId) => beforeSet.has(nodeId)),
  };
}
