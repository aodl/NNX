export function percentWidth(value) {
  return `${Math.max(0, Math.min(100, Number(value ?? 0)))}%`;
}

export function renderVotePowerBar(tally, { className = '' } = {}) {
  const bar = document.createElement('div');
  bar.className = ['vote-split-bar', className].filter(Boolean).join(' ');

  const yes = document.createElement('span');
  yes.className = 'vote-split-yes';
  yes.style.width = percentWidth(tally?.yesPercent);

  const uncast = document.createElement('span');
  uncast.className = 'vote-split-uncast';
  uncast.style.width = percentWidth(tally?.uncastPercent);

  const no = document.createElement('span');
  no.className = 'vote-split-no';
  no.style.width = percentWidth(tally?.noPercent);

  bar.append(yes, uncast, no);
  return bar;
}

export function renderCountdownBar(proposal, { className = '' } = {}) {
  const bar = document.createElement('div');
  bar.className = ['countdown-bar', className].filter(Boolean).join(' ');

  const fill = document.createElement('span');
  fill.className = `countdown-fill ${proposal?.deadlineUrgencyLevel ?? 'unavailable'}`;
  fill.style.width = percentWidth(proposal?.deadlineCountdownPercent);

  bar.append(fill);
  return bar;
}
