import { groupIssuesBySeverity } from '../data/proposal-analysis/proposal-analysis-types.js';

function chip(text, kind = '') {
  const item = document.createElement('span');
  item.className = `analysis-chip ${kind}`.trim();
  item.textContent = text;
  return item;
}

export function renderAnalysisBadges(analysis) {
  const wrap = document.createElement('div');
  wrap.className = 'analysis-badges';
  if (!analysis) return wrap;
  const { summary } = analysis;
  if (summary.criticalCount > 0) wrap.append(chip(`${summary.criticalCount} critical`, 'critical'));
  if (summary.warningCount > 0) wrap.append(chip(`${summary.warningCount} warning${summary.warningCount === 1 ? '' : 's'}`, 'warning'));
  if (summary.manualReviewCount > 0) wrap.append(chip('manual review', 'manual-review'));
  if (summary.criticalCount === 0 && summary.warningCount === 0 && summary.manualReviewCount === 0) {
    wrap.append(chip(`${summary.infoCount} info`, 'info'));
  }
  return wrap;
}

export function renderTopIssueTitles(analysis, limit = 2) {
  const list = document.createElement('div');
  list.className = 'analysis-top-issues';
  for (const issue of (analysis?.issues ?? []).slice(0, limit)) {
    const item = document.createElement('span');
    item.textContent = issue.title;
    list.append(item);
  }
  return list;
}

function issueList(title, issues) {
  if (!issues.length) return null;
  const section = document.createElement('section');
  section.className = 'analysis-issue-group';
  const h3 = document.createElement('h3');
  h3.textContent = title;
  const list = document.createElement('ul');
  for (const issue of issues) {
    const item = document.createElement('li');
    const strong = document.createElement('strong');
    strong.textContent = issue.title;
    const message = document.createElement('span');
    message.textContent = issue.message ? ` ${issue.message}` : '';
    item.append(strong, message);
    list.append(item);
  }
  section.append(h3, list);
  return section;
}

function nodeList(title, nodeIds) {
  const row = document.createElement('div');
  row.className = 'analysis-node-list';
  const label = document.createElement('span');
  label.textContent = title;
  const value = document.createElement('strong');
  value.textContent = nodeIds.length ? nodeIds.join(', ') : 'None';
  row.append(label, value);
  return row;
}

function metricLine(label, before, after) {
  const row = document.createElement('div');
  row.className = 'analysis-metric-line';
  const name = document.createElement('span');
  name.textContent = label;
  const value = document.createElement('strong');
  value.textContent = `${before} -> ${after}`;
  row.append(name, value);
  return row;
}

export function renderProposalAnalysisPanel(analysis) {
  const section = document.createElement('section');
  section.className = 'proposal-analysis-panel';
  const header = document.createElement('div');
  header.className = 'proposal-panel-header';
  const title = document.createElement('h2');
  title.className = 'proposal-panel-title';
  title.textContent = 'Proposal analysis';
  header.append(title, renderAnalysisBadges(analysis));
  section.append(header);

  if (!analysis) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Proposal analysis is unavailable.';
    section.append(empty);
    return section;
  }

  const groups = groupIssuesBySeverity(analysis.issues);
  for (const group of [
    issueList('Critical issues', groups.critical),
    issueList('Warnings', groups.warning),
    issueList('Informational findings', groups.info),
    issueList('Manual review', groups.manual_review),
  ]) {
    if (group) section.append(group);
  }

  const state = document.createElement('section');
  state.className = 'analysis-state';
  const stateTitle = document.createElement('h3');
  stateTitle.textContent = 'State change';
  state.append(
    stateTitle,
    metricLine('Nodes', analysis.stateChange.beforeNodeIds.length, analysis.stateChange.afterNodeIds.length),
    nodeList('Added', analysis.stateChange.addedNodeIds),
    nodeList('Removed', analysis.stateChange.removedNodeIds),
  );
  section.append(state);

  const diversity = analysis.metrics.diversity;
  if (diversity) {
    const decentralisation = document.createElement('section');
    decentralisation.className = 'analysis-state';
    const h3 = document.createElement('h3');
    h3.textContent = 'Decentralisation impact';
    decentralisation.append(
      h3,
      metricLine('Node providers', diversity.before.nodeProviders, diversity.after.nodeProviders),
      metricLine('Node operators', diversity.before.nodeOperators, diversity.after.nodeOperators),
      metricLine('Data centers', diversity.before.dataCenters, diversity.after.dataCenters),
      metricLine('Countries', diversity.before.countries, diversity.after.countries),
    );
    if (analysis.metrics.dfinityProvider) {
      decentralisation.append(metricLine(
        'DFINITY provider nodes',
        analysis.metrics.dfinityProvider.beforeCount,
        analysis.metrics.dfinityProvider.afterCount,
      ));
    }
    section.append(decentralisation);
  }

  return section;
}

function copyButton(label, value) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'analysis-copy-button';
  button.textContent = label;
  button.addEventListener('click', () => {
    globalThis.navigator?.clipboard?.writeText?.(value ?? '');
  });
  return button;
}

export function renderAnalysisNodeDetails(node) {
  const panel = document.createElement('div');
  panel.className = 'analysis-node-details';
  const rows = [
    ['node ID', node.nodeId ?? node.id],
    ['current subnet', node.currentSubnetId],
    ['node provider', node.nodeProviderId],
    ['node operator', node.nodeOperatorId],
    ['data center', node.dataCenterId],
    ['owner', node.dataCenterOwner],
    ['region', node.dataCenterRegion],
    ['GPS', node.gps ? `${node.gps.latitude}, ${node.gps.longitude}` : null],
    ['IPv4', node.publicIpv4?.ipAddr],
    ['domain', node.domain],
    ['HTTP/XNet endpoints', [node.httpEndpoint, node.xnetEndpoint].filter(Boolean).join(' / ') || null],
  ];
  for (const [label, value] of rows) {
    const row = document.createElement('div');
    const term = document.createElement('span');
    term.textContent = label;
    const description = document.createElement('strong');
    description.textContent = value ?? 'Unavailable';
    row.append(term, description);
    panel.append(row);
  }
  const actions = document.createElement('div');
  actions.className = 'analysis-node-actions';
  if (node.publicIpv4?.ipAddr) actions.append(copyButton('Copy IPv4', node.publicIpv4.ipAddr));
  const endpoint = node.httpEndpoint ?? node.xnetEndpoint;
  if (endpoint) actions.append(copyButton('Copy IPv6 / endpoint IP', endpoint));
  if (node.domain) actions.append(copyButton('Copy domain', node.domain));
  const link = document.createElement('a');
  link.href = 'https://www.globalping.io/';
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.textContent = 'Open Globalping for manual network-location checks';
  actions.append(link);
  panel.append(actions);
  return panel;
}
