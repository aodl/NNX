import { annotateSubnetsWithProposalImpacts } from '../data/proposal-subnet-impacts.js';
import { renderProposalPanel } from './proposal-list-panel.js';
import { capitalizeFirstLetter, formatSubnetType } from './subnet-formatters.js';
import { createSparkline, createStackedBar } from './charts.js';
import { createMetricCard } from './metric-card.js';
import { createSourceBadge } from './provenance-badge.js';
import { formatIcpE8s } from '../data/tokenomics/tokenomics-service.js';

const PROPOSAL_AUTO_REFRESH_MS = 5 * 60 * 1000;

function clear(root) {
  root.className = 'shell command-shell';
  root.textContent = '';
}

function clearRefreshTimer(root) {
  if (root.__proposalRefreshTimer) {
    globalThis.clearTimeout(root.__proposalRefreshTimer);
    root.__proposalRefreshTimer = null;
  }
}

function renderHeader({ buildInfo = null } = {}) {
  const header = document.createElement('section');
  header.className = 'command-hero';
  const copy = document.createElement('div');
  const title = document.createElement('h1');
  title.textContent = 'Governance command center';
  const subtitle = document.createElement('p');
  subtitle.className = 'subtitle';
  subtitle.textContent = 'Onchain NNS proposal intelligence, subnet evidence, and tokenomics signals.';
  const chip = document.createElement('span');
  chip.className = 'hero-build-chip';
  const commit = buildInfo?.gitCommit ? String(buildInfo.gitCommit).slice(0, 7) : 'unknown';
  chip.textContent = `Staging · commit ${commit}`;
  copy.append(title, subtitle);
  const badges = document.createElement('div');
  badges.className = 'hero-chip-row';
  badges.append(
    createSourceBadge('NNS Governance'),
    createSourceBadge('NNS Registry'),
    createSourceBadge('Historian'),
    chip,
  );

  header.append(copy, badges);
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

function renderSubnetPanel({ groups, subnets, warnings, error = null }) {
  const panel = document.createElement('section');
  panel.className = 'subnet-panel';

  const header = document.createElement('div');
  header.className = 'proposal-panel-header';

  const title = document.createElement('h2');
  title.className = 'proposal-panel-title';
  title.textContent = 'IC subnets by node count';

  const status = document.createElement('div');
  status.className = 'proposal-panel-status';
  const countText = document.createElement('strong');
  countText.textContent = `${subnets.length} subnet${subnets.length === 1 ? '' : 's'}`;
  const warningText = document.createElement('span');
  warningText.textContent = warnings.length > 0
    ? `${warnings.length} warning${warnings.length === 1 ? '' : 's'}`
    : 'Registry and CMC';
  status.append(countText, warningText);
  header.append(title, status);
  panel.append(header);

  if (error) {
    const message = document.createElement('p');
    message.className = 'muted subnet-panel-message';
    message.textContent = 'Subnet data is unavailable.';
    panel.append(message);
    return panel;
  }

  if (groups.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted subnet-panel-message';
    empty.textContent = 'No subnet records were returned.';
    panel.append(empty);
    return panel;
  }

  const groupsElement = document.createElement('div');
  groupsElement.className = 'subnet-groups';
  groups.forEach((group) => {
    const groupElement = renderSubnetGroup(group, false);
    const toggle = groupElement.querySelector('.subnet-group-toggle');
    toggle?.addEventListener('click', () => {
      const shouldExpand = toggle.getAttribute('aria-expanded') !== 'true';
      for (const section of groupsElement.querySelectorAll('.subnet-group')) {
        setSubnetGroupExpanded(section, false);
      }
      setSubnetGroupExpanded(groupElement, shouldExpand);
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

async function loadBuildInfo() {
  try {
    const response = await fetch('/generated/build-info.json', { cache: 'no-store' });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

function summarizeReadiness(proposals = []) {
  const counts = {
    open: proposals.length,
    reviewReady: 0,
    manualReview: 0,
    unsupported: 0,
    bugSuspected: 0,
  };
  for (const proposal of proposals) {
    const readiness = proposal.voteReadiness ?? proposal.analysis?.voteReadiness ?? '';
    if (readiness === 'ready') counts.reviewReady += 1;
    if (readiness === 'needs_manual_review') counts.manualReview += 1;
    if (readiness === 'unsupported') counts.unsupported += 1;
    if (readiness === 'bug_suspected') counts.bugSuspected += 1;
  }
  return counts;
}

function renderHeroMetrics({ proposals, tokenomics }) {
  const counts = summarizeReadiness(proposals);
  const latest = tokenomics?.latest ?? null;
  const grid = document.createElement('section');
  grid.className = 'metric-grid hero-metrics';
  const unavailable = 'Historian tokenomics sampling not initialized.';
  grid.append(
    createMetricCard({
      label: 'Undisbursed voting rewards',
      value: latest ? formatIcpE8s(latest.totalMaturityE8sEquivalent) : null,
      state: latest ? 'value' : 'unavailable',
      detail: latest ? 'Maturity in neurons' : unavailable,
      source: 'NNS Governance',
      chart: createSparkline((tokenomics?.series?.maturity ?? []).map((point) => point.value)),
      featured: true,
    }),
    createMetricCard({
      label: 'Total staked ICP',
      value: latest ? formatIcpE8s(latest.totalStakedE8s) : null,
      state: latest ? 'value' : 'unavailable',
      detail: latest ? 'Cached Governance metric' : unavailable,
      source: 'NNS Governance',
      chart: createSparkline((tokenomics?.series?.staked ?? []).map((point) => point.value)),
      featured: true,
    }),
    createMetricCard({
      label: 'ICP burned this week',
      value: latest?.icpBurnedWeekDeltaE8s !== null && latest?.icpBurnedWeekDeltaE8s !== undefined
        ? formatIcpE8s(latest.icpBurnedWeekDeltaE8s)
        : null,
      state: latest?.icpBurnedWeekDeltaE8s !== null && latest?.icpBurnedWeekDeltaE8s !== undefined
        ? 'value'
        : 'unavailable',
      detail: latest?.icpBurnedWeekDeltaE8s !== null && latest?.icpBurnedWeekDeltaE8s !== undefined
        ? 'Allowed ledger/system source'
        : 'Ledger burn scanner not initialized.',
      source: 'ICP Ledger',
      chart: createSparkline((tokenomics?.series?.burned ?? []).map((point) => point.value)),
      featured: true,
    }),
    createMetricCard({ label: 'Open proposals', value: String(counts.open), source: 'NNS Governance' }),
    createMetricCard({ label: 'Review-ready', value: String(counts.reviewReady), source: 'NNX analysis' }),
    createMetricCard({ label: 'Needs manual review', value: String(counts.manualReview), source: 'NNX analysis' }),
    createMetricCard({ label: 'Unsupported', value: String(counts.unsupported), source: 'NNX analysis' }),
    createMetricCard({ label: 'Bug suspected', value: String(counts.bugSuspected), source: 'NNX analysis' }),
  );
  return grid;
}

function renderSidePanels({ proposals, subnetPanelData, tokenomics }) {
  const aside = document.createElement('aside');
  aside.className = 'dashboard-side';
  const tokenomicsPanel = document.createElement('section');
  tokenomicsPanel.className = 'dashboard-panel';
  const tokenomicsTitle = document.createElement('h2');
  tokenomicsTitle.textContent = 'Tokenomics signals';
  tokenomicsPanel.append(tokenomicsTitle);
  if (tokenomics?.latest) {
    tokenomicsPanel.append(
      createMetricCard({
        label: 'Maturity in neurons',
        value: formatIcpE8s(tokenomics.latest.totalMaturityE8sEquivalent),
        source: 'Historian',
      }),
    );
  } else {
    tokenomicsPanel.append(createMetricCard({
      label: 'Historian tokenomics',
      state: 'unavailable',
      detail: 'Historian tokenomics sampling not initialized.',
      source: 'Historian',
    }));
  }
  const tokenomicsLink = document.createElement('a');
  tokenomicsLink.className = 'panel-link';
  tokenomicsLink.href = '/tokenomics';
  tokenomicsLink.textContent = 'Open tokenomics';
  tokenomicsPanel.append(tokenomicsLink);

  const signalPanel = document.createElement('section');
  signalPanel.className = 'dashboard-panel';
  const signalTitle = document.createElement('h2');
  signalTitle.textContent = 'Subnet signals';
  const signalCopy = document.createElement('p');
  signalCopy.className = 'muted';
  signalCopy.textContent = `${subnetPanelData.subnets.length} subnets grouped by node count. Derived node measurements use signal labels only.`;
  signalPanel.append(signalTitle, signalCopy);

  const unsupportedPanel = document.createElement('section');
  unsupportedPanel.className = 'dashboard-panel';
  const unsupportedTitle = document.createElement('h2');
  unsupportedTitle.textContent = 'Unsupported action backlog';
  const unsupportedCount = summarizeReadiness(proposals).unsupported;
  const unsupportedCopy = document.createElement('p');
  unsupportedCopy.className = 'muted';
  unsupportedCopy.textContent = unsupportedCount > 0
    ? `${unsupportedCount} current proposal${unsupportedCount === 1 ? '' : 's'} need analyzer support.`
    : 'No unsupported current proposals in this sample.';
  const reviewLink = document.createElement('a');
  reviewLink.className = 'panel-link';
  reviewLink.href = '/review';
  reviewLink.textContent = 'Open review queue';
  const dataLink = document.createElement('a');
  dataLink.className = 'panel-link';
  dataLink.href = '/data-sources';
  dataLink.textContent = 'Open data sources';
  unsupportedPanel.append(unsupportedTitle, unsupportedCopy, reviewLink, dataLink);

  const readinessPanel = document.createElement('section');
  readinessPanel.className = 'dashboard-panel';
  const readinessTitle = document.createElement('h2');
  readinessTitle.textContent = 'Readiness breakdown';
  const counts = summarizeReadiness(proposals);
  readinessPanel.append(readinessTitle, createStackedBar([
    { label: 'Review-ready', value: counts.reviewReady, tone: 'success' },
    { label: 'Manual review', value: counts.manualReview, tone: 'manual' },
    { label: 'Unsupported', value: counts.unsupported, tone: 'warning' },
    { label: 'Bug suspected', value: counts.bugSuspected, tone: 'critical' },
  ]));

  aside.append(tokenomicsPanel, readinessPanel, signalPanel, unsupportedPanel);
  return aside;
}

export function summarizeSubnetKinds(subnets) {
  const specialCounts = new Map();
  const counts = {
    public: 0,
    cloud_engine: 0,
    verified_application: 0,
    application: 0,
  };

  for (const subnet of subnets) {
    if (subnet.cmcLabel) {
      specialCounts.set(subnet.cmcLabel, (specialCounts.get(subnet.cmcLabel) ?? 0) + 1);
    }
    if (subnet.visibility === 'public') {
      counts.public += 1;
    }
    if (subnet.type in counts) {
      counts[subnet.type] += 1;
    }
  }

  return [
    ...[...specialCounts.entries()]
      .sort(([leftLabel], [rightLabel]) => leftLabel.localeCompare(rightLabel))
      .map(([label, count]) => ({ kind: 'special', label: capitalizeFirstLetter(label), count })),
    { kind: 'cloud-engine', label: 'Cloud Engine', count: counts.cloud_engine },
    {
      kind: 'verified-application',
      label: 'Verified Application',
      count: counts.verified_application,
    },
    { kind: 'application', label: 'Application', count: counts.application },
    { kind: 'public', label: 'Permissionless', count: counts.public },
  ].filter((item) => item.count > 0);
}

function setSubnetGroupExpanded(section, expanded) {
  section.classList.toggle('expanded', expanded);
  const buttonElement = section.querySelector('.subnet-group-toggle');
  const list = section.querySelector('.subnet-list');
  if (buttonElement) buttonElement.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  if (list) list.setAttribute('aria-hidden', expanded ? 'false' : 'true');
}

function renderSubnetGroup(group, expanded = false) {
  const section = document.createElement('section');
  section.className = 'subnet-group';
  section.classList.toggle('expanded', expanded);

  const header = document.createElement('button');
  header.className = 'subnet-group-header subnet-group-toggle';
  header.type = 'button';
  header.setAttribute('aria-expanded', expanded ? 'true' : 'false');

  const title = document.createElement('span');
  title.className = 'proposal-group-title';
  title.textContent = `${group.nodeCount} node${group.nodeCount === 1 ? '' : 's'}`;

  const count = document.createElement('span');
  count.className = 'proposal-group-count';
  count.textContent = `${group.subnets.length} subnet${group.subnets.length === 1 ? '' : 's'}`;

  const affected = renderAffectedProposalLine(group.affectedProposalCount);
  const summary = renderSubnetKindSummary(group.subnets);
  const meta = document.createElement('span');
  meta.className = 'subnet-group-title-meta';
  const chevron = document.createElement('span');
  chevron.className = 'subnet-group-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '›';
  meta.append(count, chevron);
  header.append(title, meta);
  if (affected) header.append(affected);
  header.append(summary);

  const list = document.createElement('div');
  list.className = 'subnet-list';
  list.setAttribute('aria-hidden', expanded ? 'false' : 'true');
  for (const subnet of group.subnets) {
    list.append(renderSubnetRow(subnet));
  }

  section.append(header, list);
  return section;
}

function renderSubnetKindSummary(subnets) {
  const summary = document.createElement('span');
  summary.className = 'proposal-group-statuses subnet-group-summary';

  for (const item of summarizeSubnetKinds(subnets)) {
    const chip = document.createElement('span');
    chip.className = `proposal-group-status subnet-group-summary-item ${item.kind}`;
    chip.textContent = `${item.count} ${item.label}`;
    summary.append(chip);
  }

  return summary;
}

function renderAffectedProposalLine(count) {
  if (!count || count <= 0) return null;
  const line = document.createElement('span');
  line.className = 'subnet-affected-proposals';
  line.textContent = `Referenced by ${count} proposal${count === 1 ? '' : 's'}`;
  return line;
}

function renderSubnetRow(subnet) {
  const row = document.createElement('a');
  row.className = 'subnet-row';
  row.href = `/subnet/${subnet.id}`;

  const id = document.createElement('span');
  id.className = 'subnet-id';
  id.textContent = subnet.id;

  const meta = document.createElement('span');
  meta.className = 'subnet-row-meta';

  const visibility = document.createElement('span');
  visibility.className = `subnet-chip visibility ${subnet.visibility ?? 'public'}`;
  visibility.textContent = subnet.visibilityLabel ?? 'Permissionless';

  const registryType = document.createElement('span');
  registryType.className = 'subnet-chip registry';
  registryType.textContent = subnet.registryTypeLabel ?? formatSubnetType(subnet.type);

  const affected = renderAffectedProposalLine(subnet.affectedProposalCount);
  if (affected) meta.append(affected);

  if (subnet.cmcLabel) {
    const cmcType = document.createElement('span');
    cmcType.className = 'subnet-chip cmc';
    cmcType.textContent = capitalizeFirstLetter(subnet.cmcLabel);
    meta.append(cmcType);
  }
  meta.append(registryType);
  if (subnet.visibility === 'public') {
    meta.append(visibility);
  }

  row.append(id, meta);
  return row;
}

export async function renderHomePage(root, { proposalLoader, subnetLoader, tokenomicsService = null }) {
  clearRefreshTimer(root);

  async function load() {
    clearRefreshTimer(root);

    clear(root);
    root.append(renderNotice('Loading governance command center', ''));

    let proposals;
    let subnetPanelData = { groups: [], subnets: [], warnings: [], error: null };
    let tokenomics = null;
    let buildInfo = null;
    try {
      const [proposalResult, subnetResult, tokenomicsResult, buildInfoResult] = await Promise.allSettled([
        proposalLoader.loadOpenProposals(),
        subnetLoader.loadSubnetGroups(),
        tokenomicsService?.loadTokenomics?.() ?? Promise.resolve(null),
        loadBuildInfo(),
      ]);

      if (proposalResult.status === 'rejected') throw proposalResult.reason;
      proposals = proposalResult.value;
      tokenomics = tokenomicsResult.status === 'fulfilled' ? tokenomicsResult.value : null;
      buildInfo = buildInfoResult.status === 'fulfilled' ? buildInfoResult.value : null;
      if (subnetResult.status === 'fulfilled') {
        subnetPanelData = { ...subnetResult.value, error: null };
      } else {
        subnetPanelData = { groups: [], subnets: [], warnings: [], error: subnetResult.reason };
      }
    } catch {
      clear(root);
      root.append(
        renderNotice('Unable to load proposals accepting votes', 'The NNS Governance query failed.', load),
      );
      return;
    }

    const refreshedAt = new Date();
    subnetPanelData = annotateSubnetsWithProposalImpacts(subnetPanelData, proposals);
    clear(root);
    const layout = document.createElement('div');
    layout.className = 'home-layout command-layout';
    const main = document.createElement('div');
    main.className = 'dashboard-main';
    const reviewLink = document.createElement('a');
    reviewLink.className = 'panel-link review-link';
    reviewLink.href = '/review';
    reviewLink.textContent = 'Open full review';
    const proposalPanel = renderProposalPanel({ proposals, refreshedAt });
    proposalPanel.prepend(reviewLink);
    main.append(proposalPanel, renderSubnetPanel(subnetPanelData));
    layout.append(
      main,
      renderSidePanels({ proposals, subnetPanelData, tokenomics }),
    );
    root.append(renderHeader({ buildInfo }), renderHeroMetrics({ proposals, tokenomics }), layout);

    root.__proposalRefreshTimer = globalThis.setTimeout(load, PROPOSAL_AUTO_REFRESH_MS);
  }

  await load();
}
