export function sourceBadge(source) {
  const badge = document.createElement('span');
  badge.className = 'source-badge';
  badge.textContent = source;
  return badge;
}

function isDomNode(value) {
  return typeof Node !== 'undefined' && value instanceof Node;
}

export function issueCountChips(summary = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'issue-count-chips';
  for (const [label, count, kind] of [
    ['Critical', summary.criticalCount ?? 0, 'critical'],
    ['Warning', summary.warningCount ?? 0, 'warning'],
    ['Manual', summary.manualReviewCount ?? 0, 'manual-review'],
    ['Info', summary.infoCount ?? 0, 'info'],
  ]) {
    const chip = document.createElement('span');
    chip.className = `issue-count-chip ${kind}`;
    chip.textContent = `${label}: ${count}`;
    wrap.append(chip);
  }
  return wrap;
}

export function stackedBar(segments, { className = 'stacked-bar' } = {}) {
  const total = segments.reduce((sum, segment) => sum + Number(segment.value ?? 0), 0);
  const bar = document.createElement('div');
  bar.className = className;
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', segments.map((segment) => `${segment.label} ${segment.value}`).join(', '));
  for (const segment of segments) {
    const item = document.createElement('span');
    item.className = `stacked-bar-segment ${segment.kind ?? 'neutral'}`;
    const percent = total <= 0 ? 0 : Math.max(0, Math.min(100, (Number(segment.value ?? 0) / total) * 100));
    item.style.width = `${Math.round(percent * 100) / 100}%`;
    item.title = `${segment.label}: ${segment.value}`;
    bar.append(item);
  }
  return bar;
}

export function miniDeltaTable(rows) {
  const table = document.createElement('table');
  table.className = 'mini-delta-table';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const label of ['Item', 'Before', 'After', 'Delta', 'Source']) {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.append(th);
  }
  thead.append(headRow);
  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const value of [row.item, row.before, row.after, row.delta, row.source]) {
      const td = document.createElement('td');
      if (isDomNode(value)) td.append(value);
      else td.textContent = value?.toString() ?? 'Unavailable';
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(thead, tbody);
  return table;
}

export function sparklinePlaceholder(label = 'Historian trend pending') {
  const wrap = document.createElement('div');
  wrap.className = 'sparkline-placeholder';
  const line = document.createElement('span');
  line.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.textContent = label;
  wrap.append(line, text);
  return wrap;
}
