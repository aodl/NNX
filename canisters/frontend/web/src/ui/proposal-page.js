import {
  formatPercent,
  formatTimeRemaining,
  formatTimestampSeconds,
} from '../app/view-formatters.js';
import { renderNotFoundPage } from './not-found-page.js';
import { percentWidth, renderVotePowerBar } from './vote-bar.js';

function clear(root) {
  root.className = 'shell';
  root.innerHTML = '';
}

function row(label, value) {
  const item = document.createElement('div');
  item.className = 'detail-row';
  const term = document.createElement('dt');
  term.textContent = label;
  const description = document.createElement('dd');
  if (value instanceof Node) {
    description.append(value);
  } else {
    description.textContent = value ?? 'Unavailable';
  }
  item.append(term, description);
  return item;
}

function detailSection(title, rows, open = false, aside = null) {
  const details = document.createElement('details');
  details.className = 'detail-section';
  details.open = open;
  const summary = document.createElement('summary');
  const content = document.createElement('span');
  content.className = 'detail-section-summary-content';
  const heading = document.createElement('span');
  heading.className = 'detail-section-heading';
  heading.textContent = title;
  content.append(heading);
  if (aside) {
    summary.className = 'with-aside';
    const asideNode = document.createElement('span');
    asideNode.className = 'detail-section-aside';
    asideNode.append(aside);
    content.append(asideNode);
  }
  summary.append(content);
  const list = document.createElement('dl');
  list.className = 'detail-list';
  list.append(...rows);
  details.append(summary, list);
  return details;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', `proposal-detail-icon ${name}`);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const paths = {
    hash: ['M4 9h16', 'M4 15h16', 'M10 3 8 21', 'M16 3l-2 18'],
    tag: ['M20 10 12 18 4 10V4h6l10 10Z', 'M8 8h.01'],
    user: ['M20 21a8 8 0 0 0-16 0', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z'],
    calendar: ['M8 2v4', 'M16 2v4', 'M3 10h18', 'M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z'],
    clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7v5l3 2'],
    scales: ['M12 3v18', 'M5 6h14', 'M6 6l-3 7h6L6 6Z', 'M18 6l-3 7h6l-3-7Z', 'M8 21h8'],
    link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
  };

  for (const d of paths[name] ?? []) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }

  return svg;
}

function externalLink(url) {
  if (!url) return 'Unavailable';
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.textContent = url;
  return link;
}

function actionValuesList(values) {
  const list = document.createElement('div');
  list.className = 'proposal-action-values';
  for (const { name, value } of values) {
    const item = document.createElement('div');
    item.className = 'proposal-action-value';
    const nameNode = document.createElement('strong');
    nameNode.textContent = name;
    const valueNode = document.createElement('span');
    valueNode.textContent = value;
    item.append(nameNode, valueNode);
    list.append(item);
  }
  return list;
}

function neuronLink(id, label = null) {
  if (id === null || id === undefined) return 'Unavailable';
  const link = document.createElement('a');
  link.href = `/neuron/${id.toString()}`;
  link.textContent = label ?? id.toString();
  return link;
}

function metaChip(iconName, label, value) {
  const chip = document.createElement('span');
  chip.className = 'proposal-meta-chip';
  chip.append(icon(iconName));
  const text = document.createElement('span');
  text.textContent = `${label}: ${value}`;
  chip.append(text);
  return chip;
}

function linkedMetaChip(iconName, label, link) {
  const chip = document.createElement('span');
  chip.className = 'proposal-meta-chip';
  chip.append(icon(iconName));
  const labelNode = document.createElement('span');
  labelNode.textContent = `${label}: `;
  chip.append(labelNode, link);
  return chip;
}

function visualSection(title, iconName, body) {
  const section = document.createElement('section');
  section.className = 'proposal-visual-section';
  const heading = document.createElement('div');
  heading.className = 'proposal-visual-heading';
  heading.append(icon(iconName));
  const h2 = document.createElement('h2');
  h2.textContent = title;
  heading.append(h2);
  section.append(heading, body);
  return section;
}

function votePercentLabel(kind, label, percent) {
  const item = document.createElement('span');
  item.className = `proposal-vote-label ${kind}`;
  item.textContent = `${label} ${formatPercent(percent)}`;
  return item;
}

function timelineLabel(kind, label, value) {
  const item = document.createElement('span');
  item.className = `proposal-timeline-label ${kind}`;
  if (label) {
    const labelNode = document.createElement('span');
    labelNode.textContent = `${label} `;
    item.append(labelNode);
  }
  const valueNode = document.createElement('strong');
  valueNode.textContent = value;
  item.append(valueNode);
  return item;
}

function formatCompactTimelineCountdown(deadlineTimestampSeconds) {
  return formatTimeRemaining(deadlineTimestampSeconds).replace(/^Voting closes/, 'Closes');
}

function renderVotingVisual(tally) {
  const body = document.createElement('div');
  body.className = 'proposal-vote-detail';
  if (!tally) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Latest tally unavailable.';
    body.append(empty);
    return visualSection('Voting Power', 'scales', body);
  }

  const bar = renderVotePowerBar(tally, { className: 'proposal-detail-vote-bar' });

  const labels = document.createElement('div');
  labels.className = 'proposal-vote-labels';
  labels.append(
    votePercentLabel('yes', 'Yes', tally.yesPercent),
    votePercentLabel('uncast', 'Not cast', tally.uncastPercent),
    votePercentLabel('no', 'No', tally.noPercent),
  );

  if (tally.votedYesNoTotal === 0n) {
    const empty = document.createElement('p');
    empty.className = 'proposal-detail-note';
    empty.textContent = 'No votes recorded yet.';
    body.append(bar, labels, empty);
    return visualSection('Voting Power', 'scales', body);
  }

  body.append(bar, labels);
  return visualSection('Voting Power', 'scales', body);
}

function renderTimelineVisual(proposal) {
  const body = document.createElement('div');
  body.className = 'proposal-deadline-detail';
  const bar = document.createElement('div');
  bar.className = 'countdown-bar proposal-detail-countdown-bar';
  const fill = document.createElement('span');
  fill.className = `countdown-fill ${proposal.deadlineUrgencyLevel ?? 'unavailable'}`;
  fill.style.width = percentWidth(proposal.deadlineUrgencyPercent);
  bar.append(fill);

  const labels = document.createElement('div');
  labels.className = 'proposal-timeline-labels';
  labels.append(
    timelineLabel('created', 'Created', formatTimestampSeconds(proposal.createdAtSeconds)),
    timelineLabel('countdown', '', formatCompactTimelineCountdown(proposal.deadlineTimestampSeconds)),
    timelineLabel('deadline', 'Deadline', formatTimestampSeconds(proposal.deadlineTimestampSeconds)),
  );

  body.append(bar, labels);
  return visualSection('Timeline', 'clock', body);
}

function renderProposalDetails(proposal) {
  const shell = document.createElement('main');
  shell.className = 'proposal-detail-page';

  const back = document.createElement('a');
  back.className = 'back-link';
  back.href = '/';
  back.textContent = 'Back to proposals';

  const header = document.createElement('header');
  header.className = 'proposal-detail-header';
  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'NNS Proposal';
  const title = document.createElement('h1');
  title.textContent = proposal.title;
  const subtitleLink = externalLink(proposal.url);
  if (subtitleLink instanceof Node) {
    subtitleLink.className = 'proposal-detail-subtitle-link';
  }
  const status = document.createElement('span');
  status.className = `proposal-status ${proposal.statusKind ?? 'unknown'}`;
  status.textContent = proposal.statusLabel ?? 'Unknown';
  const meta = document.createElement('div');
  meta.className = 'proposal-detail-meta';
  meta.append(
    metaChip('hash', 'Proposal', proposal.id.toString()),
    metaChip('tag', 'Type', proposal.topicLabel),
    status,
  );
  header.append(eyebrow, title);
  if (subtitleLink instanceof Node) {
    header.append(subtitleLink);
  }
  header.append(meta);

  const summary = document.createElement('p');
  summary.className = 'proposal-detail-summary';
  summary.textContent = proposal.summary || 'No summary provided.';
  const actionDescription = document.createElement('p');
  actionDescription.className = 'proposal-action-description';
  actionDescription.textContent = proposal.actionDescription;
  const actionRows = [row('Description', actionDescription)];
  const actionTitle = proposal.actionTypeName ?? 'Action';
  if (proposal.actionValues?.length) {
    actionRows.push(row('Values', actionValuesList(proposal.actionValues)));
  }
  if (proposal.actionDetails) {
    actionRows.push(row('Values', proposal.actionDetails));
  }

  shell.append(
    back,
    header,
    (() => {
      const visuals = document.createElement('div');
      visuals.className = 'proposal-visual-grid';
      visuals.append(renderVotingVisual(proposal.tally), renderTimelineVisual(proposal));
      return visuals;
    })(),
    detailSection('Proposer Claims', [
      row('Summary', summary),
    ], false, linkedMetaChip('user', 'Proposer', neuronLink(
      proposal.proposerNeuronId,
      proposal.proposerKnownNeuronName ?? null,
    ))),
    detailSection(actionTitle, actionRows, true),
  );
  return shell;
}

export async function renderProposalPage(root, { proposalId, proposalLoader }) {
  clear(root);
  const loading = document.createElement('section');
  loading.className = 'notice';
  const title = document.createElement('h1');
  title.textContent = 'Loading proposal';
  loading.append(title);
  root.append(loading);

  let proposal;
  try {
    proposal = await proposalLoader.loadProposal(proposalId);
  } catch {
    clear(root);
    const error = document.createElement('section');
    error.className = 'notice';
    const h1 = document.createElement('h1');
    h1.textContent = 'Unable to load proposal';
    const p = document.createElement('p');
    p.textContent = 'The NNS Governance query failed.';
    error.append(h1, p);
    root.append(error);
    return;
  }

  if (!proposal) {
    renderNotFoundPage(root);
    return;
  }

  clear(root);
  root.append(renderProposalDetails(proposal));
}
