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

export function summarizeProposalStatuses(proposals) {
  const counts = { open: 0, executed: 0, failed: 0 };
  for (const proposal of proposals) {
    if (proposal.statusKind in counts) {
      counts[proposal.statusKind] += 1;
    }
  }
  return counts;
}

function renderStatusSummary(proposals) {
  const counts = summarizeProposalStatuses(proposals);
  const items = [
    ['open', 'Open'],
    ['executed', 'Executed'],
    ['failed', 'Failed'],
  ].filter(([kind]) => counts[kind] > 0);

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

function renderProposalGroup(group, expanded = false) {
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
  meta.append(renderStatusSummary(group.proposals), count, chevron);
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
    for (const proposal of proposals) {
      list.append(renderProposalCard(proposal));
    }
    panel.append(list);
    return panel;
  }

  const groupsElement = document.createElement('div');
  groupsElement.className = 'proposal-groups';
  const groupedProposals = groupProposalsByTopic(proposals);
  groupedProposals.forEach((group) => {
    const groupElement = renderProposalGroup(group);
    const toggle = groupElement.querySelector('.proposal-group-toggle');
    toggle?.addEventListener('click', () => {
      const shouldExpand = toggle.getAttribute('aria-expanded') !== 'true';
      for (const section of groupsElement.querySelectorAll('.proposal-group')) {
        setGroupExpanded(section, false);
      }
      setGroupExpanded(groupElement, shouldExpand);
    });
    groupsElement.append(groupElement);
  });
  panel.append(groupsElement);
  return panel;
}
