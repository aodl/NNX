export function createUnavailableState(message = 'Historian tokenomics sampling not initialized.') {
  const state = document.createElement('div');
  state.className = 'metric-state unavailable-state';
  const status = document.createElement('strong');
  status.textContent = 'Unavailable';
  const copy = document.createElement('span');
  copy.textContent = message;
  state.append(status, copy);
  return state;
}

export function createEmptyState(message = 'No data available.') {
  const state = document.createElement('div');
  state.className = 'metric-state empty-state';
  state.textContent = message;
  return state;
}

export function createDeltaBadge({ label, tone = 'info' } = {}) {
  const badge = document.createElement('span');
  badge.className = `delta-badge ${tone}`;
  badge.textContent = label ?? 'No delta';
  return badge;
}

export function createMetricCard({
  label,
  value = null,
  state = 'value',
  detail = '',
  delta = null,
  source = '',
  chart = null,
  featured = false,
} = {}) {
  const card = document.createElement('article');
  card.className = `metric-card ${featured ? 'featured' : ''}`;
  const labelElement = document.createElement('p');
  labelElement.className = 'metric-label';
  labelElement.textContent = label;
  card.append(labelElement);

  if (state === 'loading') {
    const loading = document.createElement('div');
    loading.className = 'metric-value loading-skeleton';
    loading.textContent = 'Loading';
    card.append(loading);
  } else if (state === 'unavailable') {
    card.append(createUnavailableState(detail));
  } else {
    const valueElement = document.createElement('div');
    valueElement.className = 'metric-value';
    valueElement.textContent = value ?? 'Unavailable';
    card.append(valueElement);
    if (detail) {
      const detailElement = document.createElement('p');
      detailElement.className = 'metric-detail';
      detailElement.textContent = detail;
      card.append(detailElement);
    }
  }

  if (chart) card.append(chart);
  const footerItems = [];
  if (delta) footerItems.push(createDeltaBadge(delta));
  if (source) {
    const sourceElement = document.createElement('span');
    sourceElement.className = 'metric-source';
    sourceElement.textContent = source;
    footerItems.push(sourceElement);
  }
  if (footerItems.length > 0) {
    const footer = document.createElement('div');
    footer.className = 'metric-footer';
    footer.append(...footerItems);
    card.append(footer);
  }
  return card;
}
