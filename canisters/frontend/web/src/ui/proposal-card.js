import {
  formatTimeRemaining,
} from '../app/view-formatters.js';
import { percentWidth, renderVotePowerBar } from './vote-bar.js';

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', `proposal-icon ${name}`);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const paths = {
    scales: [
      'M12 3v18',
      'M5 6h14',
      'M6 6l-3 7h6L6 6Z',
      'M18 6l-3 7h6l-3-7Z',
      'M8 21h8',
    ],
    clock: [
      'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
      'M12 7v5l3 2',
    ],
  };

  for (const d of paths[name] ?? []) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }

  return svg;
}

function renderVoteSplit(tally) {
  const wrap = document.createElement('div');
  wrap.className = 'vote-split';

  const label = document.createElement('div');
  label.className = 'proposal-metric-label vote-split-label';
  label.title = 'Current vote split';
  label.append(icon('scales'));

  if (!tally) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Latest tally unavailable';
    wrap.append(label, empty);
    return wrap;
  }

  const bar = renderVotePowerBar(tally);

  if (tally.votedYesNoTotal === 0n) {
    const empty = document.createElement('div');
    empty.className = 'vote-split-values';
    empty.textContent = 'No votes recorded yet';
    wrap.append(label, bar, empty);
    return wrap;
  }

  wrap.append(label, bar);
  return wrap;
}

function renderCountdown(proposal) {
  const wrap = document.createElement('div');
  wrap.className = 'proposal-countdown';

  const label = document.createElement('div');
  label.className = 'proposal-metric-label countdown-label';
  label.title = 'Deadline urgency';
  label.append(icon('clock'));

  const deadline = document.createElement('p');
  deadline.className = 'proposal-deadline';
  deadline.textContent = formatTimeRemaining(proposal.deadlineTimestampSeconds);

  const bar = document.createElement('div');
  bar.className = 'countdown-bar';
  const fill = document.createElement('span');
  fill.className = `countdown-fill ${proposal.deadlineUrgencyLevel ?? 'unavailable'}`;
  fill.style.width = percentWidth(proposal.deadlineUrgencyPercent);
  bar.append(fill);

  wrap.append(label, deadline, bar);
  return wrap;
}

export function renderProposalCard(proposal) {
  const card = document.createElement('a');
  card.className = 'proposal-card';
  card.href = `/proposal/${proposal.id.toString()}`;

  const heading = document.createElement('div');
  heading.className = 'proposal-heading';

  const title = document.createElement('h2');
  title.className = 'proposal-title';
  title.textContent = proposal.title;

  const status = document.createElement('span');
  status.className = `proposal-status ${proposal.statusKind ?? 'unknown'}`;
  status.textContent = proposal.statusLabel ?? 'Unknown';

  const metrics = document.createElement('div');
  metrics.className = 'proposal-card-metrics';
  metrics.append(renderVoteSplit(proposal.tally), renderCountdown(proposal));

  heading.append(title, status);
  card.append(heading, metrics);
  return card;
}
