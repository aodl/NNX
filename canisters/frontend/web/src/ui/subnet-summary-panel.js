import { capitalizeFirstLetter, formatSubnetType } from './subnet-formatters.js';

function subnetTitle(subnet) {
  if (subnet.cmcLabel) return `${capitalizeFirstLetter(subnet.cmcLabel)} subnet`;
  return `${formatSubnetType(subnet.type)} subnet`;
}

function chip(className, text) {
  const item = document.createElement('span');
  item.className = `subnet-chip ${className}`;
  item.textContent = text;
  return item;
}

function renderSubnetSummaryCard(subnet) {
  const card = document.createElement('a');
  card.className = 'subnet-summary-card';
  card.href = `/subnet/${subnet.id}`;

  const heading = document.createElement('div');
  heading.className = 'subnet-summary-heading';
  const title = document.createElement('h3');
  title.textContent = subnetTitle(subnet);
  const status = document.createElement('span');
  status.className = `subnet-summary-status ${subnet.isHalted ? 'halted' : 'running'}`;
  status.textContent = subnet.isHalted ? 'Halted' : 'Running';
  heading.append(title, status);

  const id = document.createElement('p');
  id.className = 'subnet-id subnet-summary-id';
  id.textContent = subnet.id;

  const meta = document.createElement('div');
  meta.className = 'subnet-row-meta subnet-summary-meta';
  meta.append(
    chip('registry', subnet.registryTypeLabel ?? formatSubnetType(subnet.type)),
    chip('nodes', `${subnet.nodeCount ?? 0} node${subnet.nodeCount === 1 ? '' : 's'}`),
  );
  if (subnet.visibility === 'public') {
    meta.append(chip(`visibility ${subnet.visibility}`, subnet.visibilityLabel ?? 'Permissionless'));
  }
  if (subnet.replicaVersionId) {
    meta.append(chip('replica', `Replica ${subnet.replicaVersionId}`));
  }

  card.append(heading, id, meta);
  return card;
}

export function renderSubnetSummaryPanel({
  subnets,
  title = 'Referenced subnets',
  emptyText = 'This proposal does not reference a known subnet.',
}) {
  const panel = document.createElement('section');
  panel.className = 'subnet-summary-panel';
  const header = document.createElement('div');
  header.className = 'proposal-panel-header';
  const titleElement = document.createElement('h2');
  titleElement.className = 'proposal-panel-title';
  titleElement.textContent = title;
  const status = document.createElement('div');
  status.className = 'proposal-panel-status';
  const count = document.createElement('strong');
  count.textContent = `${subnets.length} subnet${subnets.length === 1 ? '' : 's'}`;
  status.append(count);
  header.append(titleElement, status);
  panel.append(header);

  if (subnets.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = emptyText;
    panel.append(empty);
    return panel;
  }

  const list = document.createElement('div');
  list.className = 'subnet-summary-list';
  for (const subnet of subnets) {
    list.append(renderSubnetSummaryCard(subnet));
  }
  panel.append(list);
  return panel;
}
