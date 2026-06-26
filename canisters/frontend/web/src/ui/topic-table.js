import { GUARANTEE_ANCHOR_NEURONS } from '../app/config.js';
import { formatNeuronId } from '../app/view-formatters.js';
import { getEffectiveFollowees } from '../data/effective-followees.js';
import { getDisplayTopics } from '../data/topics.js';
import { getGuaranteeStatus } from '../data/guarantee-status.js';

const NEURON_MANAGEMENT_TOPIC_KEY = 'NeuronManagement';
const ANCHOR_IDS = new Set(Object.values(GUARANTEE_ANCHOR_NEURONS).map((id) => id.toString()));

function textCell(text) {
  const td = document.createElement('td');
  td.textContent = text;
  return td;
}

function terminalLabel(reason) {
  switch (reason) {
    case 'no_followees':
      return 'No followees';
    case 'private_followee':
      return 'Private followee';
    case 'cycle':
      return 'Cycle detected';
    case 'depth_limit':
      return 'Depth limit';
    case 'query_error':
      return 'Query failed';
    case 'unexpected_followees':
      return 'Unexpected followees';
    default:
      return null;
  }
}

function warningMessage(proof) {
  switch (proof.reason) {
    case 'no_followees':
      return 'No followees are configured for this topic.';
    case 'private_followee':
      return 'At least one required followee is private, so the followee path cannot be verified.';
    case 'cycle':
      return 'The transitive followee chain contains a cycle.';
    case 'depth_limit':
      return 'The transitive followee chain exceeded the search depth.';
    case 'query_error':
      return 'A required followee could not be queried.';
    case 'blocking_followee':
      return proof.blockingFolloweeId
        ? `Followee ${formatNeuronId(proof.blockingFolloweeId)} does not resolve to a guaranteed voting path.`
        : 'At least one followee path does not resolve to a guaranteed voting path.';
    default:
      if (proof.status === 'private') return 'This topic has private followees, so the guarantee cannot be verified.';
      if (proof.status === 'unknown') return 'The voting guarantee could not be established for this topic.';
      return 'This followee setup does not guarantee a vote.';
  }
}

function warningSummary(items) {
  if (items.length === 0) return null;

  const section = document.createElement('section');
  section.className = 'warning-summary';

  const title = document.createElement('h3');
  title.textContent = 'Voting guarantee warnings';
  section.append(title);

  const list = document.createElement('ul');
  for (const item of items) {
    const row = document.createElement('li');
    const topic = document.createElement('span');
    topic.className = 'warning-topic';
    topic.textContent = item.topic.label;
    const reason = document.createElement('span');
    reason.textContent = item.message;
    row.append(topic, reason);
    list.append(row);
  }
  section.append(list);
  return section;
}

function nodeLabel(node) {
  return node.knownNeuronName || formatNeuronId(node.neuronId);
}

function shortPrincipal(principal) {
  const text = String(principal);
  if (text.length <= 15) return text;
  return `${text.slice(0, 5)}...${text.slice(-5)}`;
}

function copyPrincipalButton(principal) {
  const button = document.createElement('button');
  button.className = 'hotkey-principal';
  button.type = 'button';
  button.textContent = shortPrincipal(principal);
  button.title = principal;
  button.setAttribute('aria-label', `Copy hotkey principal ${principal}`);
  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(principal);
  });
  return button;
}

function hotkeysBadge(node) {
  if (node.hotkeysPrivate || !node.hotkeys?.length) return null;

  const badge = document.createElement('span');
  badge.className = 'hotkeys-badge';

  const label = document.createElement('span');
  label.textContent = 'Hotkeys:';
  badge.append(label);

  node.hotkeys.forEach((principal, index) => {
    if (index > 0) {
      const plus = document.createElement('span');
      plus.className = 'hotkey-plus';
      plus.textContent = '+';
      badge.append(plus);
    }
    badge.append(copyPrincipalButton(principal));
  });

  return badge;
}

function treeNode(node) {
  const id = formatNeuronId(node.neuronId);
  const known = Boolean(node.knownNeuronName);
  const anchor = ANCHOR_IDS.has(id);
  const nodeElement = document.createElement('a');
  nodeElement.className = `tree-node${known ? ' known' : ''}${anchor ? ' anchor' : ''}${node.reason === 'cycle' ? ' cycle' : ''}`;
  nodeElement.textContent = nodeLabel(node);
  nodeElement.title = known ? `${node.knownNeuronName}: ${id}` : id;
  nodeElement.href = `/neuron/${id}`;
  return nodeElement;
}

function terminalBadge(node) {
  const label = terminalLabel(node.reason);
  if (!label) return null;

  const badge = document.createElement('span');
  badge.className = `tree-terminal${node.reason === 'cycle' ? ' cycle' : ''}`;
  badge.textContent = label;
  return badge;
}

function appendTreeItems(list, nodes) {
  for (const node of nodes) {
    const item = document.createElement('li');
    const entry = document.createElement('div');
    entry.className = 'tree-entry';
    entry.append(treeNode(node));

    const hotkeys = hotkeysBadge(node);
    if (hotkeys) {
      entry.append(hotkeys);
    }

    const badge = terminalBadge(node);
    if (badge) {
      entry.append(badge);
    }

    item.append(entry);
    if (node.children?.length) {
      const children = document.createElement('ul');
      appendTreeItems(children, node.children);
      item.append(children);
    }
    list.append(item);
  }
}

function followeesCell(effective, proof) {
  const td = document.createElement('td');
  if (effective.private) {
    td.textContent = 'Private';
    return td;
  }
  if (effective.followees.length === 0) {
    td.textContent = 'None';
    return td;
  }

  const tree = document.createElement('ul');
  tree.className = 'followee-tree';
  appendTreeItems(tree, proof.children ?? []);
  td.append(tree);
  return td;
}

function followeeGroupKey(effective) {
  if (effective.private) return 'private';
  const ids = effective.followees.map((id) => formatNeuronId(id)).sort();
  return ids.length === 0 ? 'none' : ids.join(',');
}

function groupSummaryCell(group) {
  const td = document.createElement('td');
  td.colSpan = 2;

  const wrap = document.createElement('div');
  wrap.className = 'topic-group';

  const label = document.createElement('span');
  label.className = 'topic-group-label';
  label.textContent = 'Followees:';
  wrap.append(label);

  if (group.effective.private) {
    const value = document.createElement('span');
    value.className = 'topic-group-text';
    value.textContent = 'Private';
    wrap.append(value);
  } else if (group.effective.followees.length === 0) {
    const value = document.createElement('span');
    value.className = 'topic-group-text';
    value.textContent = 'None';
    wrap.append(value);
  } else {
    const nodes = document.createElement('div');
    nodes.className = 'topic-group-followees';
    for (const child of group.proof.children ?? []) {
      nodes.append(treeNode(child));
    }
    wrap.append(nodes);
  }

  const count = document.createElement('span');
  count.className = 'topic-group-count';
  const followeeReference = group.effective.followees?.length === 1 ? 'this followee' : 'these followees';
  count.textContent = `${group.rows.length} topic${group.rows.length === 1 ? '' : 's'} with ${followeeReference}`;
  wrap.append(count);

  td.append(wrap);
  return td;
}

function groupHeaderRow(group) {
  const row = document.createElement('tr');
  row.className = 'topic-group-row';
  const topicLabel = document.createElement('td');
  topicLabel.className = 'topic-group-topic';
  topicLabel.textContent = 'Topic';
  row.append(topicLabel, groupSummaryCell(group));
  return row;
}

function infoIcon(text) {
  const icon = document.createElement('span');
  icon.className = 'info-icon';
  icon.textContent = 'i';
  icon.title = text;
  icon.setAttribute('aria-label', text);
  return icon;
}

function noteBadge(className, text, tooltip = null) {
  const wrap = document.createElement('span');
  wrap.className = 'note-wrap';

  const badge = document.createElement('span');
  badge.className = className;
  badge.textContent = text;
  wrap.append(badge);

  if (tooltip) wrap.append(infoIcon(tooltip));
  return wrap;
}

function notesCell(proof, topic, topicAnalysis) {
  const td = document.createElement('td');
  td.className = 'notes-cell';

  if (topic.key === NEURON_MANAGEMENT_TOPIC_KEY) {
    td.append(noteBadge(
      'status info',
      'Not a rewardable topic',
      'Neuron Management is a special NNS topic and does not earn voting rewards.',
    ));
  }

  if (topicAnalysis?.unexpectedFollowees) {
    td.append(noteBadge(
      'status warning',
      'Unexpected followees',
      'Neuron Management followees are expected to vote directly for managed neurons; indirect followees are not expected on this topic.',
    ));
    return td;
  }

  if (proof.status === 'guaranteed') {
    td.append(noteBadge(
      'status guaranteed',
      'Guaranteed to vote',
      'This neuron is guaranteed to cast a vote because every required followee path reaches an Alpha/Omega voting neuron under the conservative all-followees rule.',
    ));
    return td;
  }

  if (proof.depthLimitReached) {
    const reason = document.createElement('p');
    reason.className = 'reason';
    reason.textContent = 'Could not prove guarantee because the transitive following chain exceeded the search depth.';
    td.append(reason);
  }

  return td;
}

function proofNodeFromNeuron(neuron, reason = null, children = []) {
  return {
    neuronId: neuron.id,
    knownNeuronName: neuron.knownNeuronName ?? null,
    hotkeys: neuron.hotkeys ?? [],
    hotkeysPrivate: neuron.hotkeysPrivate ?? !neuron.public,
    reason,
    children,
  };
}

async function nodeForNeuronId(neuronId, neuronLoader, reason = null) {
  try {
    const neuron = await neuronLoader.loadNeuron(neuronId);
    return proofNodeFromNeuron(neuron, reason);
  } catch {
    return { neuronId, reason: reason ?? 'query_error', children: [] };
  }
}

async function renderNeuronManagementFollowees({ effective, topic, neuronLoader }) {
  const children = [];
  let unexpectedFollowees = false;

  for (const followeeId of effective.followees) {
    let followee;
    try {
      followee = await neuronLoader.loadNeuron(followeeId);
    } catch {
      children.push({ neuronId: followeeId, reason: 'query_error', children: [] });
      continue;
    }

    const nested = getEffectiveFollowees(followee, topic);
    if (nested.private) {
      children.push(proofNodeFromNeuron(followee, 'private_followee'));
      continue;
    }

    const nestedChildren = await Promise.all(
      nested.followees.map((id) => nodeForNeuronId(id, neuronLoader, 'unexpected_followees')),
    );
    if (nestedChildren.length > 0) unexpectedFollowees = true;
    children.push(proofNodeFromNeuron(
      followee,
      nestedChildren.length > 0 ? 'unexpected_followees' : null,
      nestedChildren,
    ));
  }

  return {
    proof: { status: 'not_applicable', depthLimitReached: false, children },
    unexpectedFollowees,
  };
}

export async function renderTopicTable({ neuron, neuronLoader }) {
  const content = document.createElement('div');
  content.className = 'topic-coverage';

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';

  const table = document.createElement('table');

  const groups = [];
  const groupsByKey = new Map();
  const warnings = [];
  for (const topic of getDisplayTopics()) {
    const effective = getEffectiveFollowees(neuron, topic);
    if (topic.key === NEURON_MANAGEMENT_TOPIC_KEY && effective.followees.length === 0) {
      continue;
    }

    const topicAnalysis = topic.key === NEURON_MANAGEMENT_TOPIC_KEY && !neuron.followeesPrivate
      ? await renderNeuronManagementFollowees({ effective, topic, neuronLoader })
      : null;
    const proof = topicAnalysis?.proof ?? (neuron.followeesPrivate
      ? { status: 'private', depthLimitReached: false }
      : await getGuaranteeStatus({ neuron, topic, neuronLoader }));

    if (topic.key !== NEURON_MANAGEMENT_TOPIC_KEY && proof.status !== 'guaranteed') {
      warnings.push({ topic, message: warningMessage(proof) });
    }

    const key = followeeGroupKey(effective);
    let group = groupsByKey.get(key);
    if (!group) {
      group = { effective, index: groups.length, proof, rows: [], hasNeuronManagement: false };
      groupsByKey.set(key, group);
      groups.push(group);
    }
    if (topic.key === NEURON_MANAGEMENT_TOPIC_KEY) {
      group.hasNeuronManagement = true;
    }
    group.rows.push({ topic, effective, proof, topicAnalysis });
  }

  groups.sort((a, b) => {
    if (a.hasNeuronManagement !== b.hasNeuronManagement) {
      return a.hasNeuronManagement ? -1 : 1;
    }
    return b.rows.length - a.rows.length || a.index - b.index;
  });

  const tbody = document.createElement('tbody');
  for (const group of groups) {
    tbody.append(groupHeaderRow(group));
    const rows = [...group.rows].sort((a, b) => {
      if (a.topic.key === NEURON_MANAGEMENT_TOPIC_KEY) return -1;
      if (b.topic.key === NEURON_MANAGEMENT_TOPIC_KEY) return 1;
      return 0;
    });
    for (const item of rows) {
      const row = document.createElement('tr');
      row.append(
        textCell(item.topic.label),
        followeesCell(item.effective, item.proof),
        notesCell(item.proof, item.topic, item.topicAnalysis),
      );
      tbody.append(row);
    }
  }

  table.append(tbody);
  wrap.append(table);

  const summary = warningSummary(warnings);
  if (summary) content.append(summary);
  content.append(wrap);
  return content;
}
