import { createMiniAreaChart, createStackedBar } from './charts.js';
import { createMetricCard, createUnavailableState } from './metric-card.js';
import { createProvenanceList, createSourceBadge } from './provenance-badge.js';
import { formatIcpE8s } from '../data/tokenomics/tokenomics-service.js';

function clear(root) {
  root.className = 'shell tokenomics-shell';
  root.textContent = '';
}

function metric(label, value, source = 'Historian') {
  return createMetricCard({ label, value, source, featured: true });
}

function unavailableMetric(label) {
  return createMetricCard({
    label,
    state: 'unavailable',
    detail: 'Historian tokenomics sampling not initialized.',
    source: 'Historian',
  });
}

function renderHeader(view) {
  const header = document.createElement('section');
  header.className = 'command-hero tokenomics-hero';
  const copy = document.createElement('div');
  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'NNX Tokenomics';
  const title = document.createElement('h1');
  title.textContent = 'Tokenomics';
  const subtitle = document.createElement('p');
  subtitle.className = 'subtitle';
  subtitle.textContent = 'Historian snapshots from allowed onchain and system canister sources.';
  copy.append(eyebrow, title, subtitle);
  const meta = document.createElement('div');
  meta.className = 'hero-chip-row';
  meta.append(
    createSourceBadge('NNS Governance'),
    createSourceBadge('ICP Ledger'),
    createSourceBadge('Historian'),
  );
  const freshness = document.createElement('span');
  freshness.className = `freshness-badge ${view.unavailable ? 'warning' : 'success'}`;
  freshness.textContent = view.unavailable
    ? 'No historian sample'
    : `Last sample ${new Date(view.latest.sampledAtTimestampSeconds * 1000).toISOString()}`;
  meta.append(freshness);
  header.append(copy, meta);
  return header;
}

function renderCards(view) {
  const grid = document.createElement('section');
  grid.className = 'metric-grid';
  const latest = view.latest;
  if (!latest) {
    for (const label of [
      'Maturity in neurons',
      'Staked maturity',
      'Total staked ICP',
      'Total locked ICP',
      'ICP burned this week',
      'ICP supply',
    ]) grid.append(unavailableMetric(label));
    return grid;
  }
  grid.append(
    metric('Maturity in neurons', formatIcpE8s(latest.totalMaturityE8sEquivalent), 'NNS Governance'),
    metric('Staked maturity', formatIcpE8s(latest.totalStakedMaturityE8sEquivalent), 'NNS Governance'),
    metric('Total staked ICP', formatIcpE8s(latest.totalStakedE8s), 'NNS Governance'),
    metric('Total locked ICP', formatIcpE8s(latest.totalLockedE8s), 'NNS Governance'),
    latest.icpBurnedWeekDeltaE8s === null
      ? unavailableMetric('ICP burned this week')
      : metric('ICP burned this week', formatIcpE8s(latest.icpBurnedWeekDeltaE8s), 'ICP Ledger'),
    metric('ICP supply', formatIcpE8s(latest.totalSupplyE8s), 'NNS Governance'),
  );
  return grid;
}

function renderBands(view) {
  const section = document.createElement('section');
  section.className = 'dashboard-panel';
  const title = document.createElement('h2');
  title.textContent = 'Dissolve-delay bands';
  const caveat = document.createElement('p');
  caveat.className = 'muted';
  caveat.textContent = 'Bucketed from NNS Governance cached metrics; half-year granularity. Dissolve-delay bands are derived from half-year Governance metric buckets. Near-boundary values are approximate.';
  section.append(title, caveat);
  if (!view.latest) {
    section.append(createUnavailableState());
    return section;
  }
  const latest = view.latest;
  section.append(createStackedBar([
    { label: 'Below voting threshold', value: latest.belowVotingThresholdStakedE8s ?? 0n, tone: 'warning' },
    { label: 'Minimum voting-delay band', value: latest.minDelayBandStakedE8s ?? 0n, tone: 'info' },
    { label: 'Middle dissolve-delay band', value: latest.middleDelayBandStakedE8s ?? 0n, tone: 'success' },
    { label: 'Maximum dissolve-delay band', value: latest.maxDelayBandStakedE8s ?? 0n, tone: 'manual' },
  ]));
  return section;
}

function renderCharts(view) {
  const section = document.createElement('section');
  section.className = 'dashboard-panel';
  const title = document.createElement('h2');
  title.textContent = 'Historical charts';
  section.append(title);
  const grid = document.createElement('div');
  grid.className = 'chart-grid';
  const charts = [
    ['Weekly maturity in neurons', view.series.maturity],
    ['Weekly total staked ICP', view.series.staked],
    ['Weekly ICP burned', view.series.burned],
    ['Weekly supply', view.series.supply],
  ];
  for (const [label, series] of charts) {
    grid.append(createMetricCard({
      label,
      value: series.length ? `${series.length} samples` : 'Unavailable',
      chart: createMiniAreaChart(series.map((point) => point.value), { width: 260, height: 82 }),
      source: 'Historian',
    }));
  }
  section.append(grid);
  return section;
}

function renderMethodology(view) {
  const section = document.createElement('section');
  section.className = 'dashboard-panel methodology-panel';
  const title = document.createElement('h2');
  title.textContent = 'Methodology';
  const list = document.createElement('ul');
  for (const item of [
    'NNX does not use ICP Dashboard APIs as data sources.',
    'Voting rewards are recorded as maturity and are not minted as ICP until spawned or disbursed.',
    'Staked ICP bands are computed from Governance cached metrics.',
    'ICP burned is derived only if ledger/index/archive data can be queried from allowed onchain/system canisters.',
  ]) {
    const li = document.createElement('li');
    li.textContent = item;
    list.append(li);
  }
  section.append(title, list);
  section.append(createProvenanceList((view.latest?.provenance ?? []).map((item) => ({
    label: item.source,
    detail: item.method,
  }))));
  return section;
}

export async function renderTokenomicsPage(root, { tokenomicsService }) {
  clear(root);
  root.append(createMetricCard({ label: 'Tokenomics', state: 'loading', source: 'Historian' }));
  let view;
  try {
    view = await tokenomicsService.loadTokenomics();
  } catch {
    view = { unavailable: true, latest: null, series: { maturity: [], staked: [], burned: [], supply: [] } };
  }
  clear(root);
  root.append(renderHeader(view), renderCards(view), renderBands(view), renderCharts(view), renderMethodology(view));
}
