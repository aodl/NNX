export function createSourceBadge(label, detail = '') {
  const badge = document.createElement('span');
  badge.className = 'source-badge';
  const text = document.createElement('span');
  text.textContent = label;
  badge.append(text);
  if (detail) {
    const suffix = document.createElement('small');
    suffix.textContent = detail;
    badge.append(suffix);
  }
  return badge;
}

export function createProvenanceList(items = []) {
  const list = document.createElement('div');
  list.className = 'provenance-list';
  for (const item of items) {
    list.append(createSourceBadge(item.label ?? String(item), item.detail ?? ''));
  }
  return list;
}
