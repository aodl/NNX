import { formatTimestampSeconds } from '../app/view-formatters.js';
import { renderProposalCard } from './proposal-card.js';

export function groupProposalsByTopic(proposals) {
  const groups = [];
  const byTopic = new Map();
  for (const proposal of proposals) {
    const key = proposal.topicLabel ?? 'Unknown topic';
    let group = byTopic.get(key);
    if (!group) {
      group = { topicLabel: key, proposals: [] };
      byTopic.set(key, group);
      groups.push(group);
    }
    group.proposals.push(proposal);
  }
  return groups;
}

const PROPOSAL_STATUS_DISPLAY_ORDER = [
  ['open', 'Open'],
  ['adopted', 'Adopted'],
  ['executed', 'Executed'],
  ['failed', 'Failed'],
  ['rejected', 'Rejected'],
  ['unknown', 'Unknown'],
];

function proposalStatusKey(proposal) {
  return proposal.statusKind ?? 'unknown';
}

function proposalStatusLabel(proposal, key) {
  return proposal.statusLabel ?? PROPOSAL_STATUS_DISPLAY_ORDER.find(([kind]) => kind === key)?.[1] ?? 'Unknown';
}

export function groupProposalsByStatus(proposals) {
  const byStatus = new Map();
  for (const proposal of proposals) {
    const key = proposalStatusKey(proposal);
    let group = byStatus.get(key);
    if (!group) {
      group = {
        statusKind: key,
        statusLabel: proposalStatusLabel(proposal, key),
        proposals: [],
      };
      byStatus.set(key, group);
    }
    group.proposals.push(proposal);
  }

  const ordered = [];
  for (const [kind, fallbackLabel] of PROPOSAL_STATUS_DISPLAY_ORDER) {
    const group = byStatus.get(kind);
    if (group) {
      ordered.push({ ...group, statusLabel: group.statusLabel ?? fallbackLabel });
      byStatus.delete(kind);
    }
  }
  ordered.push(...byStatus.values());
  return ordered;
}

export function summarizeProposalStatuses(proposals) {
  const counts = Object.fromEntries(PROPOSAL_STATUS_DISPLAY_ORDER.map(([kind]) => [kind, 0]));
  for (const proposal of proposals) {
    if (proposal.statusKind in counts) {
      counts[proposal.statusKind] += 1;
    }
  }
  return counts;
}

function renderStatusSummary(proposals) {
  const counts = summarizeProposalStatuses(proposals);
  const items = PROPOSAL_STATUS_DISPLAY_ORDER.filter(([kind]) => counts[kind] > 0);

  const summary = document.createElement('span');
  summary.className = 'proposal-group-statuses';
  for (const [kind, label] of items) {
    const item = document.createElement('span');
    item.className = `proposal-group-status ${kind}`;
    item.textContent = `${counts[kind]} ${label}`;
    summary.append(item);
  }
  return summary;
}

function setGroupExpanded(section, expanded) {
  section.classList.toggle('expanded', expanded);
  const buttonElement = section.querySelector('.proposal-group-toggle');
  const list = section.querySelector('.proposal-list');
  if (buttonElement) buttonElement.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  if (list) list.setAttribute('aria-hidden', expanded ? 'false' : 'true');
}

function renderProposalGroup(group, { expanded = false, showStatusSummary = true } = {}) {
  const section = document.createElement('section');
  section.className = 'proposal-group';
  section.classList.toggle('expanded', expanded);

  const header = document.createElement('button');
  header.className = 'proposal-group-header';
  header.classList.add('proposal-group-toggle');
  header.type = 'button';
  header.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  const title = document.createElement('span');
  title.className = 'proposal-group-title';
  title.textContent = group.topicLabel;
  const meta = document.createElement('span');
  meta.className = 'proposal-group-meta';
  const count = document.createElement('span');
  count.className = 'proposal-group-count';
  count.textContent = `${group.proposals.length} proposal${group.proposals.length === 1 ? '' : 's'}`;
  const chevron = document.createElement('span');
  chevron.className = 'proposal-group-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '›';
  if (showStatusSummary) meta.append(renderStatusSummary(group.proposals));
  meta.append(count, chevron);
  header.append(title, meta);

  const list = document.createElement('div');
  list.className = 'proposal-list';
  list.setAttribute('aria-hidden', expanded ? 'false' : 'true');
  for (const proposal of group.proposals) {
    list.append(renderProposalCard(proposal));
  }

  section.append(header, list);
  return section;
}

function renderStatusSection(statusGroup) {
  const section = document.createElement('section');
  section.className = `proposal-status-section ${statusGroup.statusKind}`;

  const header = document.createElement('div');
  header.className = 'proposal-status-section-header';
  const title = document.createElement('h3');
  title.className = 'proposal-status-section-title';
  title.textContent = statusGroup.statusLabel;
  const count = document.createElement('span');
  count.className = `proposal-group-status ${statusGroup.statusKind}`;
  count.textContent = `${statusGroup.proposals.length} proposal${statusGroup.proposals.length === 1 ? '' : 's'}`;
  header.append(title, count);
  section.append(header);

  const groupsElement = document.createElement('div');
  groupsElement.className = 'proposal-groups proposal-topic-subgroups';
  const groupedProposals = groupProposalsByTopic(statusGroup.proposals);
  groupedProposals.forEach((group) => {
    const groupElement = renderProposalGroup(group, { showStatusSummary: false });
    const toggle = groupElement.querySelector('.proposal-group-toggle');
    toggle?.addEventListener('click', () => {
      const shouldExpand = toggle.getAttribute('aria-expanded') !== 'true';
      for (const nestedSection of groupsElement.querySelectorAll('.proposal-group')) {
        setGroupExpanded(nestedSection, false);
      }
      setGroupExpanded(groupElement, shouldExpand);
    });
    groupsElement.append(groupElement);
  });
  section.append(groupsElement);
  return section;
}

function renderStatus({ proposals, refreshedAt, statusText }) {
  const status = document.createElement('div');
  status.className = 'proposal-panel-status';
  const countText = document.createElement('strong');
  countText.textContent = `${proposals.length} proposal${proposals.length === 1 ? '' : 's'}`;
  status.append(countText);
  if (statusText) {
    const text = document.createElement('span');
    text.textContent = statusText;
    status.append(text);
  } else if (refreshedAt) {
    const refreshed = document.createElement('span');
    refreshed.textContent = `Last refreshed ${formatTimestampSeconds(BigInt(Math.floor(refreshedAt.getTime() / 1000)))}`;
    status.append(refreshed);
  }
  return status;
}

export function renderProposalPanel({
  proposals,
  refreshedAt = null,
  title = 'NNS proposals accepting votes',
  emptyText = 'There are currently no NNS proposals accepting votes.',
  statusText = null,
  grouped = true,
  severityFilters = false,
  className = 'proposal-panel',
}) {
  const panel = document.createElement('section');
  panel.className = className;

  const header = document.createElement('div');
  header.className = 'proposal-panel-header';

  const titleElement = document.createElement('h2');
  titleElement.className = 'proposal-panel-title';
  titleElement.textContent = title;

  header.append(titleElement, renderStatus({ proposals, refreshedAt, statusText }));
  panel.append(header);

  if (proposals.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = emptyText;
    panel.append(empty);
    return panel;
  }

  if (!grouped) {
    const list = document.createElement('div');
    list.className = 'proposal-list embedded-proposal-list';
    const cards = [];
    for (const proposal of proposals) {
      const card = renderProposalCard(proposal);
      card.dataset.severities = Object.entries(proposal.analysis?.summary ?? {})
        .filter(([, count]) => count > 0)
        .map(([key]) => key.replace('Count', '').replace('manualReview', 'manual_review'))
        .join(' ');
      cards.push(card);
      list.append(card);
    }
    if (severityFilters) {
      const filters = document.createElement('div');
      filters.className = 'proposal-severity-filters';
      const active = new Set(['critical', 'warning', 'manual_review', 'info']);
      for (const [severity, label] of [
        ['critical', 'Critical'],
        ['warning', 'Warning'],
        ['manual_review', 'Manual review'],
        ['info', 'Info'],
      ]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.setAttribute('aria-pressed', 'true');
        button.addEventListener('click', () => {
          if (active.has(severity)) active.delete(severity);
          else active.add(severity);
          button.setAttribute('aria-pressed', active.has(severity) ? 'true' : 'false');
          for (const card of cards) {
            const severities = card.dataset.severities.split(' ').filter(Boolean);
            card.hidden = severities.length > 0 && !severities.some((item) => active.has(item));
          }
        });
        filters.append(button);
      }
      panel.append(filters);
    }
    panel.append(list);
    return panel;
  }

  const groupsElement = document.createElement('div');
  groupsElement.className = 'proposal-status-sections';
  const groupedProposals = groupProposalsByStatus(proposals);
  groupedProposals.forEach((group) => {
    groupsElement.append(renderStatusSection(group));
  });
  panel.append(groupsElement);
  return panel;
}
