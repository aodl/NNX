import { mountSubnetGlobe } from './subnet-globe.js';

function truncateNodeId(nodeId) {
  if (typeof nodeId !== 'string' || nodeId.length <= 16) return nodeId;
  return `${nodeId.slice(0, 10)}...`;
}

function locationTitle(group) {
  return group.dataCenterId ?? 'Unknown data center';
}

function locationMeta(group) {
  return group.dataCenterId ?? 'Unknown data center';
}

function nodeKey(group, nodeId) {
  return `${group.key}:${nodeId}`;
}

function intentGroup(group) {
  if (group.proposalIntent === 'add') return 'add';
  if (group.proposalIntent === 'remove') return 'remove';
  return 'other';
}

function intentLabel(intent) {
  if (intent === 'add') return 'Add';
  if (intent === 'remove') return 'Remove';
  return 'Other';
}

function visibleIntentSet(filters) {
  return new Set(Object.entries(filters)
    .filter(([, visible]) => visible)
    .map(([intent]) => intent));
}

function renderNodeDetails(group, nodeId) {
  const details = document.createElement('div');
  details.className = 'node-location-node-details';
  const node = group.nodes?.find((item) => item.nodeId === nodeId) ?? {};

  const rows = [
    ['node ID', nodeId],
    ['node provider', node.nodeProviderId],
    ['node operator', node.nodeOperatorId],
    ['Data center', group.dataCenterId ?? 'Unknown'],
    ['Region', group.dataCenterRegion ?? 'Unknown'],
    ['Owner', group.dataCenterOwner ?? 'Unknown'],
    ['Registry GPS', group.gps ? `${group.gps.latitude}, ${group.gps.longitude}` : null],
    ['domain', node.domain],
    ['IPv4', node.publicIpv4?.ipAddr],
    ['IPv6', node.publicIpv6?.ipAddr],
    ['HTTP endpoint', node.httpEndpoint],
    ['XNet endpoint', node.xnetEndpoint],
    ['metric signal', node.healthSignal],
  ];

  for (const [label, value] of rows) {
    const row = document.createElement('div');
    const key = document.createElement('span');
    key.textContent = label;
    const val = document.createElement('strong');
    val.textContent = value ?? 'Unavailable';
    row.append(key, val);
    details.append(row);
  }

  const actions = document.createElement('div');
  actions.className = 'analysis-node-actions';
  for (const [label, value] of [
    ['Copy node ID', nodeId],
    ['Copy IPv4', node.publicIpv4?.ipAddr],
    ['Copy IPv6', node.publicIpv6?.ipAddr],
    ['Copy domain', node.domain],
    ['Copy HTTP endpoint', node.httpEndpoint],
    ['Copy XNet endpoint', node.xnetEndpoint],
  ]) {
    if (!value) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'analysis-copy-button';
    button.textContent = label;
    button.addEventListener('click', () => globalThis.navigator?.clipboard?.writeText?.(value));
    actions.append(button);
  }
  const link = document.createElement('a');
  link.href = 'https://www.globalping.io/';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Manual external check - Not used by NNX validation';
  actions.append(link);
  details.append(actions);

  return details;
}

function renderNodeLocationList(groups, focusGroup) {
  const panel = document.createElement('aside');
  panel.className = 'node-location-panel';

  const heading = document.createElement('h3');
  heading.textContent = 'Mapped nodes';
  panel.append(heading);

  if (groups.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted node-location-empty';
    empty.textContent = 'No mapped nodes.';
    panel.append(empty);
    return panel;
  }

  const list = document.createElement('div');
  list.className = 'node-location-list';
  const cardsByKey = new Map();
  const nodesByKey = new Map();
  const sectionsByIntent = new Map();
  let currentFilters = { add: true, remove: true, other: true };

  function setElementHidden(element, hidden) {
    element.hidden = hidden;
    element.classList.toggle('is-hidden', hidden);
  }

  for (const intent of ['add', 'remove', 'other']) {
    const section = document.createElement('section');
    section.className = `node-location-intent-group ${intent}`;
    section.dataset.intent = intent;

    const sectionHeader = document.createElement('h4');
    sectionHeader.className = 'node-location-intent-heading';
    sectionHeader.textContent = intentLabel(intent);

    const sectionList = document.createElement('div');
    sectionList.className = 'node-location-intent-list';
    section.append(sectionHeader, sectionList);
    sectionsByIntent.set(intent, { section, sectionList });
  }

  for (const group of groups) {
    const intent = intentGroup(group);
    const card = document.createElement('section');
    card.className = `node-location-group ${intent}`;
    card.dataset.groupKey = group.key;
    card.dataset.intent = intent;

    const nodes = document.createElement('div');
    nodes.className = 'node-location-node-list';

    for (const nodeId of group.nodeIds) {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'node-location-node';
      const prefix = document.createElement('span');
      prefix.className = 'node-location-node-id';
      prefix.textContent = truncateNodeId(nodeId);
      const dc = document.createElement('span');
      dc.className = 'node-location-node-dc';
      dc.textContent = locationMeta(group);
      node.append(prefix, dc);
      node.title = nodeId;
      node.dataset.nodeKey = nodeKey(group, nodeId);
      node.addEventListener('mouseenter', () => focusGroup(group.key, nodeId));
      node.addEventListener('focus', () => focusGroup(group.key, nodeId));
      node.addEventListener('click', () => focusGroup(group.key, nodeId));
      nodes.append(node);
      nodesByKey.set(node.dataset.nodeKey, { node, group, nodeId, intent });
    }

    const header = document.createElement('div');
    header.className = 'node-location-group-header';
    const title = document.createElement('h4');
    title.textContent = locationTitle(group);
    const count = document.createElement('span');
    count.className = 'node-location-count';
    count.textContent = `${group.nodeCount} node${group.nodeCount === 1 ? '' : 's'}`;
    header.append(title, count);

    card.addEventListener('mouseleave', () => focusGroup(null));
    card.addEventListener('focusout', (event) => {
      if (!card.contains(event.relatedTarget)) focusGroup(null);
    });

    card.append(header, nodes);
    cardsByKey.set(group.key, card);
    sectionsByIntent.get(intent).sectionList.append(card);
  }

  for (const { section, sectionList } of sectionsByIntent.values()) {
    if (sectionList.children.length > 0) list.append(section);
  }

  panel.append(list);
  function applyIntentFiltersToRows(activeGroup = null, mapFiltered = false) {
    for (const [key, card] of cardsByKey) {
      const intent = card.dataset.intent;
      const visibleByFilter = currentFilters[intent] !== false;
      setElementHidden(card, !visibleByFilter || (mapFiltered && key !== activeGroup?.key));
    }

    for (const [, { node, intent }] of nodesByKey) {
      const visibleByFilter = currentFilters[intent] !== false;
      setElementHidden(node, !visibleByFilter);
      const existingDetails = node.nextElementSibling?.classList.contains('node-location-node-details')
        ? node.nextElementSibling
        : null;
      if (!visibleByFilter) existingDetails?.remove();
    }
  }

  function applyIntentSectionVisibility(activeGroup = null, mapFiltered = false) {
    for (const [intent, { section, sectionList }] of sectionsByIntent) {
      const visibleByFilter = currentFilters[intent] !== false;
      const containsActive = activeGroup && intent === intentGroup(activeGroup);
      const hasVisibleCards = [...sectionList.children].some((card) => !card.classList.contains('is-hidden'));
      setElementHidden(section, !visibleByFilter || !hasVisibleCards || (mapFiltered && !containsActive));
      section.style.order = mapFiltered && containsActive ? '-1' : '';
      sectionList.style.order = '';
    }
  }

  panel.updateActiveGroup = (groupKey, nodeId = null, { source = 'list' } = {}) => {
    const activeGroup = groups.find((group) => group.key === groupKey) ?? null;
    const activeNodeKey = activeGroup ? nodeKey(activeGroup, nodeId ?? activeGroup.nodeIds[0]) : null;
    const mapFiltered = source === 'map' && Boolean(activeGroup);

    for (const [key, card] of cardsByKey) {
      card.classList.toggle('is-active', key === groupKey);
      card.classList.toggle('is-faded', Boolean(groupKey) && key !== groupKey);
      card.style.order = mapFiltered && key === groupKey ? '-1' : '';
    }
    applyIntentFiltersToRows(activeGroup, mapFiltered);
    applyIntentSectionVisibility(activeGroup, mapFiltered);
    for (const [key, { node, group, nodeId: itemNodeId }] of nodesByKey) {
      node.classList.toggle('is-active', key === activeNodeKey);
      const existingDetails = node.nextElementSibling?.classList.contains('node-location-node-details')
        ? node.nextElementSibling
        : null;
      if (key === activeNodeKey && !node.hidden) {
        if (!existingDetails) node.after(renderNodeDetails(group, itemNodeId));
      } else {
        existingDetails?.remove();
      }
    }
  };
  panel.updateIntentFilters = (filters) => {
    const visibleIntents = visibleIntentSet(filters);
    currentFilters = {
      add: visibleIntents.has('add'),
      remove: visibleIntents.has('remove'),
      other: visibleIntents.has('other'),
    };
    applyIntentFiltersToRows();
    applyIntentSectionVisibility();
    panel.updateActiveGroup?.(null, null, { source: 'filter' });
  };
  return panel;
}

export function renderNodeGlobePanel({
  locationGroups,
  title = 'Node map',
  caption = null,
  ariaLabel = 'Globe showing node data center locations',
}) {
  const groupsWithGps = locationGroups.filter((group) => group.gps);
  const figure = document.createElement('figure');
  figure.className = 'subnet-globe';

  const header = document.createElement('div');
  header.className = 'node-globe-header';

  if (title) {
    const heading = document.createElement('h2');
    heading.className = 'node-globe-title';
    heading.textContent = title;
    header.append(heading);
  }

  const globe = document.createElement('div');
  globe.className = 'subnet-globe-stage';
  globe.setAttribute('role', 'img');
  globe.setAttribute('aria-label', ariaLabel);

  let viewMode = 'globe';
  const filters = { add: true, remove: true, other: true };
  let cleanupPromise = null;
  let mountToken = 0;

  const body = document.createElement('div');
  body.className = 'node-map-body';
  const locationList = renderNodeLocationList(groupsWithGps, (groupKey, nodeId = null) => {
    locationList.updateActiveGroup?.(groupKey, nodeId, { source: 'list' });
    globe.dispatchEvent(new CustomEvent('subnet-map-request-focus', {
      detail: { groupKey, source: 'list' },
      bubbles: true,
    }));
  });
  body.append(globe, locationList);

  const mapControls = document.createElement('div');
  mapControls.className = 'node-map-controls';

  const modeToggle = document.createElement('div');
  modeToggle.className = 'node-map-toggle';
  modeToggle.setAttribute('aria-label', 'Map view');

  const buttons = new Map(['globe', 'flat'].map((mode) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'node-map-toggle-button';
    button.textContent = mode === 'globe' ? 'Globe' : 'Flat';
    button.setAttribute('aria-pressed', mode === viewMode ? 'true' : 'false');
    button.addEventListener('click', () => {
      if (viewMode === mode) return;
      viewMode = mode;
      mountMap();
    });
    modeToggle.append(button);
    return [mode, button];
  }));

  const filterToggle = document.createElement('div');
  filterToggle.className = 'node-map-filter-toggle';
  filterToggle.setAttribute('aria-label', 'Node filters');
  const filterButtons = new Map(['add', 'remove', 'other'].map((intent) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `node-map-filter-button ${intent}`;
    button.textContent = intentLabel(intent);
    button.setAttribute('aria-pressed', 'true');
    button.addEventListener('click', () => {
      filters[intent] = !filters[intent];
      setFilterState();
      locationList.updateIntentFilters?.(filters);
      globe.dispatchEvent(new CustomEvent('subnet-map-filter-change', {
        detail: { filters: { ...filters } },
        bubbles: true,
      }));
    });
    filterToggle.append(button);
    return [intent, button];
  }));

  mapControls.append(modeToggle, filterToggle);
  globe.append(mapControls);

  function setToggleState() {
    for (const [mode, button] of buttons) {
      button.setAttribute('aria-pressed', mode === viewMode ? 'true' : 'false');
    }
  }

  function setFilterState() {
    for (const [intent, button] of filterButtons) {
      button.setAttribute('aria-pressed', filters[intent] ? 'true' : 'false');
    }
  }

  function renderUnavailable() {
    for (const child of [...globe.children]) {
      if (child !== mapControls) child.remove();
    }
    const empty = document.createElement('p');
    empty.className = 'muted subnet-globe-fallback';
    empty.textContent = 'Map unavailable.';
    globe.append(empty);
  }

  function mountMap() {
    const token = ++mountToken;
    setToggleState();
    globe.classList.toggle('is-flat', viewMode === 'flat');
    cleanupPromise?.then((cleanup) => cleanup?.()).catch(() => {});
    cleanupPromise = mountSubnetGlobe(globe, locationGroups, { viewMode, filters }).catch(() => {
      if (token === mountToken) renderUnavailable();
      return null;
    });
  }

  globe.addEventListener('subnet-map-focus', (event) => {
    locationList.updateActiveGroup?.(event.detail?.groupKey ?? null, null, {
      source: event.detail?.source ?? 'map',
    });
  });

  if (header.children.length > 0) figure.append(header);
  mountMap();

  const captionElement = document.createElement('figcaption');
  captionElement.textContent = caption ?? (groupsWithGps.length > 0
    ? `${groupsWithGps.length} data center location${groupsWithGps.length === 1 ? '' : 's'} from Registry GPS metadata`
    : 'No Registry GPS metadata is available for these nodes.');

  figure.append(body, captionElement);
  return figure;
}
