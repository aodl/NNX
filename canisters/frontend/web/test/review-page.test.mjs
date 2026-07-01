import assert from 'node:assert/strict';
import test from 'node:test';
import { renderReviewWorkbench, unsupportedActionGroups } from '../src/ui/review-page.js';

class TestElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.className = '';
    this.textContent = '';
    this.href = '';
    this.name = '';
    this.value = '';
    this.hidden = false;
    this.dataset = {};
    this.listeners = {};
  }

  append(...children) {
    this.children.push(...children);
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  addEventListener(name, fn) {
    this.listeners[name] = fn;
  }

  dispatch(name) {
    this.listeners[name]?.();
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      if (!(node instanceof TestElement)) return;
      if (selector.startsWith('.')) {
        if (node.className.split(/\s+/).includes(selector.slice(1))) matches.push(node);
      } else if (node.tagName === selector) {
        matches.push(node);
      }
      for (const child of node.children) visit(child);
    };
    visit(this);
    return matches;
  }

  getTextContent() {
    return [
      this.textContent,
      ...this.children
        .filter((child) => child instanceof TestElement)
        .map((child) => child.getTextContent()),
    ].join('');
  }
}

function withDocument(fn) {
  const original = globalThis.document;
  globalThis.document = {
    createElement: (tagName) => new TestElement(tagName),
  };
  try {
    return fn();
  } finally {
    globalThis.document = original;
  }
}

function proposal(id, readiness, overrides = {}) {
  const issue = readiness === 'unsupported'
    ? { code: 'UNSUPPORTED_PROPOSAL_ANALYSIS', severity: 'info', lifecycle: 'pre_execution' }
    : null;
  return {
    id: BigInt(id),
    title: `Proposal ${id}`,
    topicLabel: overrides.topicLabel ?? 'Node Admin',
    actionTypeName: overrides.actionTypeName ?? 'DeployGuestOS',
    statusKind: 'open',
    statusLabel: 'Open',
    rewardStatusKind: 'accepting-votes',
    rewardStatusLabel: 'Accepting votes',
    deadlineUrgencyLevel: overrides.deadlineUrgencyLevel ?? 'safe',
    analysis: {
      actionKind: readiness === 'unsupported' ? 'Unsupported' : 'ChangeSubnetMembership',
      lifecycle: 'pre_execution',
      confidence: readiness === 'unsupported' ? 'unsupported' : 'high',
      issues: issue ? [issue] : [],
      dataWarnings: readiness === 'needs_manual_review' ? [{ message: 'missing' }] : [],
      summary: { criticalCount: 0, warningCount: 0, manualReviewCount: 0, infoCount: issue ? 1 : 0 },
    },
  };
}

test('renderReviewPage groups proposals by readiness', () => withDocument(() => {
  const page = renderReviewWorkbench([
    proposal(1, 'ready'),
    proposal(2, 'unsupported'),
    proposal(3, 'needs_manual_review'),
  ]);
  const text = page.getTextContent();
  assert.match(text, /Review-ready/);
  assert.match(text, /Unsupported action/);
  assert.match(text, /Needs manual review/);
}));

test('filters hide and show proposal rows', () => withDocument(() => {
  const page = renderReviewWorkbench([
    proposal(1, 'ready'),
    proposal(2, 'unsupported'),
  ]);
  const readinessSelect = page.querySelectorAll('select')[0];
  readinessSelect.value = 'unsupported';
  readinessSelect.dispatch('change');
  const rows = page.querySelectorAll('.review-proposal-row');
  assert.equal(rows[0].hidden, true);
  assert.equal(rows[1].hidden, false);
}));

test('unsupported-action backlog groups by actionTypeName', () => {
  const groups = unsupportedActionGroups([
    proposal(1, 'unsupported', { actionTypeName: 'DeployGuestOS' }),
    proposal(2, 'unsupported', { actionTypeName: 'DeployGuestOS' }),
    proposal(3, 'ready', { actionTypeName: 'ChangeSubnetMembership' }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].actionTypeName, 'DeployGuestOS');
  assert.equal(groups[0].openCount, 2);
});

