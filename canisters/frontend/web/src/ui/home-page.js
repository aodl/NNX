import { formatTimestampSeconds } from '../app/view-formatters.js';
import { renderProposalCard } from './proposal-card.js';

const PROPOSAL_AUTO_REFRESH_MS = 5 * 60 * 1000;

function clear(root) {
  root.className = 'shell';
  root.innerHTML = '';
}

function clearRefreshTimer(root) {
  if (root.__proposalRefreshTimer) {
    globalThis.clearTimeout(root.__proposalRefreshTimer);
    root.__proposalRefreshTimer = null;
  }
}

function renderHeader() {
  const header = document.createElement('header');
  header.className = 'home-header';

  const title = document.createElement('h1');
  title.textContent = 'NETWORK NEXUS';
  const subtitle = document.createElement('p');
  subtitle.className = 'subtitle';
  subtitle.textContent = 'Optimizing NNS governance and tokenomics';

  header.append(title, subtitle);
  return header;
}

function button(label, onClick) {
  const item = document.createElement('button');
  item.className = 'button';
  item.type = 'button';
  item.textContent = label;
  item.addEventListener('click', onClick);
  return item;
}

function renderProposalPanel({ proposals, refreshedAt }) {
  const panel = document.createElement('section');
  panel.className = 'proposal-panel';

  const header = document.createElement('div');
  header.className = 'proposal-panel-header';

  const title = document.createElement('h2');
  title.className = 'proposal-panel-title';
  title.textContent = 'NNS proposals accepting votes';

  const status = document.createElement('div');
  status.className = 'proposal-panel-status';
  const countText = document.createElement('strong');
  countText.textContent = `${proposals.length} proposal${proposals.length === 1 ? '' : 's'}`;
  const refreshed = document.createElement('span');
  refreshed.textContent = `Last refreshed ${formatTimestampSeconds(BigInt(Math.floor(refreshedAt.getTime() / 1000)))}`;
  status.append(countText, refreshed);

  header.append(title, status);
  panel.append(header);

  if (proposals.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'There are currently no NNS proposals accepting votes.';
    panel.append(empty);
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

function renderNotice(title, message, retry = null) {
  const section = document.createElement('section');
  section.className = 'notice';
  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'Network Nexus';
  const h1 = document.createElement('h1');
  h1.textContent = title;
  const p = document.createElement('p');
  p.textContent = message;
  section.append(eyebrow, h1, p);
  if (retry) {
    section.append(button('Retry', retry));
  }
  return section;
}

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

export async function renderHomePage(root, { proposalLoader }) {
  clearRefreshTimer(root);

  async function load() {
    clearRefreshTimer(root);

    clear(root);
    root.append(renderHeader(), renderNotice('Loading proposals accepting votes', ''));

    let proposals;
    try {
      proposals = await proposalLoader.loadOpenProposals();
    } catch {
      clear(root);
      root.append(
        renderHeader(),
        renderNotice('Unable to load proposals accepting votes', 'The NNS Governance query failed.', load),
      );
      return;
    }

    const refreshedAt = new Date();
    clear(root);
    const layout = document.createElement('div');
    layout.className = 'home-layout';
    layout.append(renderProposalPanel({ proposals, refreshedAt }));
    root.append(renderHeader(), layout);

    root.__proposalRefreshTimer = globalThis.setTimeout(load, PROPOSAL_AUTO_REFRESH_MS);
  }

  await load();
}
