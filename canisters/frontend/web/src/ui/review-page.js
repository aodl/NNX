import { classifyVoteReadiness, readinessLabel } from '../data/proposal-analysis/vote-readiness.js';
import { proposalStatusDisplay } from '../data/proposal-analysis/status-display.js';
import { lifecycleLabel } from './labels.js';

const READINESS_ORDER = ['ready', 'needs_manual_review', 'unsupported', 'misleading', 'bug_suspected'];

function clear(root) {
  root.className = 'shell detail-shell';
  root.innerHTML = '';
}

function countBy(values, keyFn) {
  const counts = new Map();
  for (const value of values) {
    const key = keyFn(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function proposalReadiness(proposal) {
  return classifyVoteReadiness(proposal.analysis);
}

export function unsupportedActionGroups(proposals) {
  const unsupported = proposals.filter((proposal) => proposalReadiness(proposal) === 'unsupported');
  const groups = new Map();
  for (const proposal of unsupported) {
    const key = [
      proposal.actionTypeName ?? proposal.analysis?.actionKind ?? 'Unsupported',
      proposal.topicLabel ?? 'Unknown topic',
      proposal.nnsFunctionId ?? '',
      proposal.nnsFunctionName ?? '',
    ].join('|');
    const existing = groups.get(key) ?? {
      actionTypeName: proposal.actionTypeName ?? proposal.analysis?.actionKind ?? 'Unsupported',
      topicLabel: proposal.topicLabel ?? 'Unknown topic',
      nnsFunctionId: proposal.nnsFunctionId ?? null,
      nnsFunctionName: proposal.nnsFunctionName ?? null,
      openCount: 0,
      exampleProposalIds: [],
      recommendedAnalyzerFamily: recommendedAnalyzerFamily(proposal),
    };
    existing.openCount += 1;
    if (existing.exampleProposalIds.length < 5) existing.exampleProposalIds.push(proposal.id?.toString());
    groups.set(key, existing);
  }
  return [...groups.values()].sort((left, right) => right.openCount - left.openCount);
}

function recommendedAnalyzerFamily(proposal) {
  const text = `${proposal.actionTypeName ?? ''} ${proposal.topicLabel ?? ''}`.toLowerCase();
  if (/api boundary/.test(text)) return 'API-boundary';
  if (/guestos|hostos|ssh|subnet operational|split subnet|delete subnet|version/.test(text)) return 'OS/node-admin';
  if (/node|subnet/.test(text)) return 'node/subnet';
  if (/governance|followee|neuron/.test(text)) return 'governance';
  if (/sns/.test(text)) return 'SNS';
  if (/econom/.test(text)) return 'economics';
  if (/canister/.test(text)) return 'canister';
  return 'other';
}

function summaryCard(label, value, kind = '') {
  const card = document.createElement('div');
  card.className = `review-summary-card ${kind}`.trim();
  const strong = document.createElement('strong');
  strong.textContent = value.toString();
  const span = document.createElement('span');
  span.textContent = label;
  card.append(strong, span);
  return card;
}

function renderFilters(proposals, list) {
  const form = document.createElement('form');
  form.className = 'review-filters';
  const readiness = document.createElement('select');
  readiness.name = 'readiness';
  for (const [value, label] of [['all', 'All readiness'], ...READINESS_ORDER.map((item) => [item, readinessLabel(item)])]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    readiness.append(option);
  }
  readiness.value = 'all';
  const topic = document.createElement('select');
  topic.name = 'topic';
  const topics = ['all', ...countBy(proposals, (proposal) => proposal.topicLabel ?? 'Unknown topic').keys()];
  for (const value of topics) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value === 'all' ? 'All topics' : value;
    topic.append(option);
  }
  topic.value = 'all';
  const actionType = document.createElement('select');
  actionType.name = 'actionType';
  const actionTypes = ['all', ...countBy(proposals, (proposal) => proposal.actionTypeName ?? 'Unknown action').keys()];
  for (const value of actionTypes) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value === 'all' ? 'All action types' : value;
    actionType.append(option);
  }
  actionType.value = 'all';
  const severity = document.createElement('select');
  severity.name = 'severity';
  for (const value of ['all', 'critical', 'warning', 'manual_review', 'info']) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value === 'all' ? 'All severities' : value.replace('_', ' ');
    severity.append(option);
  }
  severity.value = 'all';
  const lifecycle = document.createElement('select');
  lifecycle.name = 'lifecycle';
  for (const value of ['all', 'pre_execution', 'post_execution_success', 'post_execution_failed', 'rejected', 'unknown']) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value === 'all' ? 'All lifecycle modes' : lifecycleLabel(value);
    lifecycle.append(option);
  }
  lifecycle.value = 'all';
  const parserConfidence = document.createElement('select');
  parserConfidence.name = 'parserConfidence';
  for (const value of ['all', 'high', 'medium', 'low', 'unsupported']) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value === 'all' ? 'All parser confidence' : value;
    parserConfidence.append(option);
  }
  parserConfidence.value = 'all';
  const impact = document.createElement('select');
  impact.name = 'impact';
  for (const [value, label] of [['all', 'All impact'], ['infrastructure', 'Node/subnet/API-boundary impact']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    impact.append(option);
  }
  impact.value = 'all';
  const urgency = document.createElement('select');
  urgency.name = 'urgency';
  for (const [value, label] of [['all', 'All deadlines'], ['warning', 'Urgent deadlines']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    urgency.append(option);
  }
  urgency.value = 'all';

  const apply = () => {
    for (const row of list.querySelectorAll('.review-proposal-row')) {
      const visible = [
        readiness.value === 'all' || row.dataset.readiness === readiness.value,
        topic.value === 'all' || row.dataset.topic === topic.value,
        actionType.value === 'all' || row.dataset.actionType === actionType.value,
        severity.value === 'all' || row.dataset.severities.split(',').includes(severity.value),
        lifecycle.value === 'all' || row.dataset.lifecycle === lifecycle.value,
        parserConfidence.value === 'all' || row.dataset.parserConfidence === parserConfidence.value,
        impact.value === 'all' || row.dataset.impact === 'true',
        urgency.value === 'all' || row.dataset.urgency === urgency.value,
      ].every(Boolean);
      row.hidden = !visible;
    }
  };
  for (const control of [readiness, topic, actionType, severity, lifecycle, parserConfidence, impact, urgency]) {
    control.addEventListener('change', apply);
    form.append(control);
  }
  return form;
}

function renderProposalRows(proposals) {
  const list = document.createElement('div');
  list.className = 'review-proposal-list';
  for (const proposal of proposals) {
    const display = proposalStatusDisplay(proposal);
    const readiness = proposalReadiness(proposal);
    const row = document.createElement('a');
    row.className = 'review-proposal-row';
    row.href = `/proposal/${proposal.id}`;
    row.dataset.readiness = readiness;
    row.dataset.topic = proposal.topicLabel ?? 'Unknown topic';
    row.dataset.actionType = proposal.actionTypeName ?? 'Unknown action';
    row.dataset.severities = (proposal.analysis?.issues ?? []).map((issue) => issue.severity).join(',');
    row.dataset.lifecycle = proposal.analysis?.lifecycle ?? display.lifecycle;
    row.dataset.parserConfidence = proposal.analysis?.confidence ?? 'unknown';
    row.dataset.impact = /node|subnet|api boundary/i.test(`${proposal.topicLabel ?? ''} ${proposal.actionTypeName ?? ''}`);
    row.dataset.urgency = proposal.deadlineUrgencyLevel ?? 'unavailable';
    for (const value of [
      proposal.id?.toString(),
      proposal.title,
      proposal.topicLabel,
      proposal.actionTypeName,
      display.decisionStatusLabel,
      display.rewardStatusLabel,
      lifecycleLabel(proposal.analysis?.lifecycle ?? display.lifecycle),
      readinessLabel(readiness),
      `Issues ${(proposal.analysis?.issues ?? []).length}`,
      proposal.analysis?.confidence ?? 'unknown',
    ]) {
      const span = document.createElement('span');
      span.textContent = value ?? 'Unavailable';
      row.append(span);
    }
    list.append(row);
  }
  return list;
}

function renderUnsupportedBacklog(groups) {
  const section = document.createElement('section');
  section.className = 'unsupported-backlog';
  const h2 = document.createElement('h2');
  h2.textContent = 'Unsupported-action backlog';
  section.append(h2);
  if (groups.length === 0) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'No unsupported current proposals.';
    section.append(p);
    return section;
  }
  for (const group of groups) {
    const card = document.createElement('article');
    card.className = 'unsupported-backlog-card';
    const title = document.createElement('h3');
    title.textContent = group.actionTypeName;
    const body = document.createElement('p');
    body.textContent = `${group.openCount} current proposal(s). Examples: ${group.exampleProposalIds.join(', ')}. Topic: ${group.topicLabel}. Function: ${group.nnsFunctionName ?? group.nnsFunctionId ?? 'Unavailable'}. Likely analyzer family: ${group.recommendedAnalyzerFamily}. Suggested next step: add fixtures, parse structured fields, and show conservative evidence before validation.`;
    card.append(title, body);
    section.append(card);
  }
  return section;
}

export function renderReviewWorkbench(proposals, { refreshedAt = new Date() } = {}) {
  const main = document.createElement('main');
  main.className = 'review-page';
  const header = document.createElement('header');
  header.className = 'review-header';
  const h1 = document.createElement('h1');
  h1.textContent = 'Review workbench';
  const meta = document.createElement('p');
  meta.className = 'muted';
  meta.textContent = `Last refreshed ${refreshedAt.toISOString()}`;
  const home = document.createElement('a');
  home.href = '/';
  home.textContent = 'Back to proposals';
  header.append(h1, meta, home);

  const readinessCounts = countBy(proposals, proposalReadiness);
  const summary = document.createElement('section');
  summary.className = 'review-summary-grid';
  summary.append(
    summaryCard('Accepting votes', proposals.length),
    ...READINESS_ORDER.map((readiness) => summaryCard(readinessLabel(readiness), readinessCounts.get(readiness) ?? 0, readiness)),
  );
  const list = renderProposalRows(proposals);
  main.append(header, summary, renderFilters(proposals, list), list, renderUnsupportedBacklog(unsupportedActionGroups(proposals)));
  return main;
}

export async function renderReviewPage(root, { proposalLoader }) {
  clear(root);
  const loading = document.createElement('section');
  loading.className = 'notice';
  const h1 = document.createElement('h1');
  h1.textContent = 'Loading review workbench';
  loading.append(h1);
  root.append(loading);
  try {
    const proposals = await proposalLoader.loadOpenProposals();
    clear(root);
    root.append(renderReviewWorkbench(proposals));
  } catch {
    clear(root);
    const error = document.createElement('section');
    error.className = 'notice';
    const title = document.createElement('h1');
    title.textContent = 'Unable to load review workbench';
    const p = document.createElement('p');
    p.textContent = 'The NNS Governance query failed.';
    error.append(title, p);
    root.append(error);
  }
}
