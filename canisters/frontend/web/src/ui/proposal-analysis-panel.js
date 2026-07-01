import { groupIssuesBySeverity } from '../data/proposal-analysis/proposal-analysis-types.js';
import {
  classifyVoteReadiness,
  readinessDescription,
  readinessLabel,
  recommendedReviewerAction,
} from '../data/proposal-analysis/vote-readiness.js';
import { lifecycleLabel, severityLabel } from './labels.js';
import { issueCountChips, miniDeltaTable, sourceBadge } from './widgets.js';

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
  const isCollapsible = title === 'Informational findings';
  const section = document.createElement(isCollapsible ? 'details' : 'section');
  section.className = 'analysis-issue-group';
  if (isCollapsible) {
    section.open = false;
    const summary = document.createElement('summary');
    summary.textContent = title;
    section.append(summary);
  } else {
    const h3 = document.createElement('h3');
    h3.textContent = title;
    section.append(h3);
  }
  const list = document.createElement('ul');
  for (const issue of issues) {
    const item = document.createElement('li');
    const strong = document.createElement('strong');
    strong.textContent = issue.title;
    const message = document.createElement('span');
    message.textContent = issue.message ? ` ${issue.message}` : '';
    item.append(strong, message, issueExplanation(issue));
    list.append(item);
  }
  section.append(list);
  return section;
}

function confidenceNotice(confidence) {
  if (!['medium', 'low', 'unsupported'].includes(confidence)) return null;
  const note = document.createElement('p');
  note.className = `analysis-confidence-note ${confidence}`;
  if (confidence === 'low') {
    note.textContent = 'Manual review: NNX used low-confidence proposal parsing for this action.';
  } else if (confidence === 'unsupported') {
    note.textContent = 'Unsupported action: NNX shows compact informational analysis only.';
  } else {
    note.textContent = 'NNX used structured action data and found extra free-text references.';
  }
  return note;
}

function nodeList(title, nodeIds) {
  const isCollapsible = (nodeIds?.length ?? 0) > 10;
  const row = document.createElement(isCollapsible ? 'details' : 'div');
  row.className = 'analysis-node-list';
  if (isCollapsible) {
    const summary = document.createElement('summary');
    summary.textContent = `${title}: ${nodeIds.length} nodes`;
    row.append(summary);
  }
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

function issueExplanation(issue) {
  const explanations = {
    REMOVE_NODE_HAS_NO_ELEVATED_FAILURE_SIGNAL: 'NNX did not observe an elevated block-production failure signal in the selected historian window. This does not prove the node is healthy; it means this specific measured signal does not support removal.',
    NODE_METRICS_UNAVAILABLE: 'Historian node metrics were unavailable or unsupported for this query. Reviewers should not infer node health from this missing data.',
    REGISTRY_VERSION_INCONSISTENT: 'Some Registry records were read from different Registry versions. NNX treats the analysis as partial because topology may have changed between reads.',
    API_BOUNDARY_REMOVE_NODE_NOT_API_BOUNDARY: 'Certified state did not show this node as an API boundary node. If this proposal is pre-execution, removal may be redundant or based on information NNX cannot observe.',
    UNSUPPORTED_PROPOSAL_ANALYSIS: 'NNX has not implemented a deterministic analyzer for this action type yet. Use the proposal payload and linked supporting material manually.',
  };
  const text = explanations[issue?.code];
  if (!text) {
    const empty = document.createElement('span');
    empty.className = 'issue-explanation empty';
    return empty;
  }
  const note = document.createElement('p');
  note.className = 'issue-explanation';
  note.textContent = text;
  return note;
}

function field(label, value) {
  const row = document.createElement('div');
  row.className = 'readiness-field';
  const term = document.createElement('span');
  term.textContent = label;
  const description = document.createElement('strong');
  description.textContent = value ?? 'Unavailable';
  row.append(term, description);
  return row;
}

function supportedActionLabel(analysis) {
  if (!analysis) return 'Unavailable';
  if (analysis.actionKind === 'Unsupported') return 'No';
  return 'Yes';
}

export function renderVoteReadinessPanel(analysis, proposal = null) {
  const section = document.createElement('section');
  section.className = 'vote-readiness-panel';
  const title = document.createElement('h2');
  title.textContent = 'Vote readiness';
  section.append(title);

  if (!analysis) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Vote readiness is unavailable.';
    section.append(empty);
    return section;
  }

  const readiness = classifyVoteReadiness(analysis);
  const chip = document.createElement('span');
  chip.className = `readiness-chip ${readiness}`;
  chip.textContent = readinessLabel(readiness);

  const description = document.createElement('p');
  description.className = 'proposal-detail-note';
  description.textContent = readinessDescription(readiness);

  const grid = document.createElement('div');
  grid.className = 'readiness-grid';
  grid.append(
    field('Readiness', readinessLabel(readiness)),
    field('Lifecycle', lifecycleLabel(analysis.lifecycle)),
    field('Parser confidence', severityLabel(analysis.confidence)),
    field('Supported action', supportedActionLabel(analysis)),
    field('Critical', analysis.summary.criticalCount),
    field('Warnings', analysis.summary.warningCount),
    field('Manual review', analysis.summary.manualReviewCount),
    field('Info', analysis.summary.infoCount),
    field('Data warnings', (analysis.dataWarnings ?? []).length),
    field('Recommended reviewer action', recommendedReviewerAction(analysis, readiness)),
  );

  section.append(chip, description, grid);

  if (analysis.actionKind === 'Unsupported') {
    const unsupported = document.createElement('div');
    unsupported.className = 'unsupported-action-panel';
    const h3 = document.createElement('h3');
    h3.textContent = 'Unsupported action details';
    unsupported.append(
      h3,
      field('Action type', proposal?.actionTypeName ?? analysis.intent?.actionTypeName ?? 'Unsupported'),
      field('Topic', proposal?.topicLabel ?? 'Unavailable'),
      field('NNS function', proposal?.nnsFunctionName ?? proposal?.nnsFunctionId ?? 'Unavailable'),
      field('What NNX can still show', 'Proposal metadata, normalized payload fields, lifecycle, vote tally, and onchain evidence that existing boundaries can load.'),
      field('What NNX cannot yet validate', 'A deterministic action-specific precondition or postcondition check.'),
      field('Fixture capture', `node tools/scripts/capture-proposal-fixture.mjs ${analysis.proposalId ?? proposal?.id ?? '<proposal-id>'}`),
    );
    section.append(unsupported);
  }

  return section;
}

function renderEvidenceChecklist(analysis) {
  const section = document.createElement('section');
  section.className = 'evidence-checklist';
  const h3 = document.createElement('h3');
  h3.textContent = 'Evidence checklist';
  const list = document.createElement('ul');
  const hasNodes = (analysis.stateChange?.currentNodeIds?.length ?? 0) > 0
    || (analysis.stateChange?.beforeNodeIds?.length ?? 0) > 0
    || (analysis.stateChange?.afterNodeIds?.length ?? 0) > 0;
  const checks = [
    ['Governance proposal loaded', true, 'Governance'],
    ['Supported action parser loaded', analysis.actionKind !== 'Unsupported', 'Governance'],
    ['Target subnet known when applicable', Boolean(analysis.intent?.targetSubnetId), 'Registry'],
    ['Current subnet membership loaded when applicable', hasNodes, 'Registry'],
    ['Node records loaded when applicable', hasNodes, 'Registry'],
    ['Node provider/operator/data-center loaded when applicable', Boolean(analysis.metrics?.diversity), 'Registry'],
    ['CMC labels loaded when applicable', true, 'CMC'],
    ['Node metrics loaded or typed unavailable', Boolean(analysis.metrics?.nodeHealth) || analysis.issues.some((issue) => issue.code === 'NODE_METRICS_UNAVAILABLE'), 'Historian / node metrics'],
    ['Open proposal conflicts checked', true, 'Governance'],
    ['Certified API-boundary membership available when applicable', analysis.actionKind?.includes('ApiBoundary') ? analysis.issues.every((issue) => issue.code !== 'API_BOUNDARY_MEMBERSHIP_UNAVAILABLE') : true, 'Certified state'],
    ['API-boundary metrics intentionally not used', true, 'Certified state'],
  ];
  for (const [label, ok, source] of checks) {
    const item = document.createElement('li');
    item.textContent = `${ok ? 'Available' : 'Missing'}: ${label} `;
    item.append(sourceBadge(source));
    list.append(item);
  }
  section.append(h3, list);
  return section;
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

  section.append(renderVoteReadinessPanel(analysis));
  const groups = groupIssuesBySeverity(analysis.issues);
  const lifecycle = document.createElement('div');
  lifecycle.className = 'analysis-lifecycle-mode';
  lifecycle.textContent = `Lifecycle mode: ${lifecycleLabel(analysis.lifecycle)}`;
  section.append(lifecycle);
  section.append(issueCountChips(analysis.summary), renderEvidenceChecklist(analysis));
  const parserNote = confidenceNotice(analysis.confidence);
  if (parserNote) section.append(parserNote);
  for (const group of [
    issueList('Critical issues', groups.critical),
    issueList('Warnings', groups.warning),
    issueList('Manual review', groups.manual_review),
    issueList('Informational findings', groups.info),
  ]) {
    if (group) section.append(group);
  }

  const state = document.createElement('section');
  state.className = 'analysis-state';
  const stateTitle = document.createElement('h3');
  stateTitle.textContent = 'State change';
  state.append(stateTitle, miniDeltaTable([
    {
      item: 'Node count',
      before: analysis.stateChange.beforeNodeIds.length,
      after: analysis.stateChange.afterNodeIds.length,
      delta: analysis.stateChange.afterNodeIds.length - analysis.stateChange.beforeNodeIds.length,
      source: sourceBadge('Registry'),
    },
    {
      item: 'Added nodes',
      before: 0,
      after: analysis.stateChange.addedNodeIds.length,
      delta: analysis.stateChange.addedNodeIds.length,
      source: sourceBadge('Registry'),
    },
    {
      item: 'Removed nodes',
      before: analysis.stateChange.removedNodeIds.length,
      after: 0,
      delta: -analysis.stateChange.removedNodeIds.length,
      source: sourceBadge('Registry'),
    },
  ]), nodeList('Added', analysis.stateChange.addedNodeIds), nodeList('Removed', analysis.stateChange.removedNodeIds));
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
      metricLine('Continents', diversity.before.continents, diversity.after.continents),
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
    ['country', node.normalizedCountryName ?? node.normalizedCountryCode],
    ['continent', node.normalizedContinent],
    ['GPS', node.gps ? `${node.gps.latitude}, ${node.gps.longitude}` : null],
    ['IPv4', node.publicIpv4?.ipAddr],
    ['IPv6', node.publicIpv6?.ipAddr],
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
  if (node.publicIpv6?.ipAddr) actions.append(copyButton('Copy IPv6', node.publicIpv6.ipAddr));
  const endpoint = node.httpEndpoint ?? node.xnetEndpoint;
  if (endpoint) actions.append(copyButton('Copy endpoint', endpoint));
  if (node.domain) actions.append(copyButton('Copy domain', node.domain));
  const link = document.createElement('a');
  link.href = 'https://www.globalping.io/';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Manual external check - Not used by NNX validation';
  actions.append(link);
  panel.append(actions);
  return panel;
}
