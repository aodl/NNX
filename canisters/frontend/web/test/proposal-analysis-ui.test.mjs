import assert from 'node:assert/strict';
import test from 'node:test';
import { renderProposalCard } from '../src/ui/proposal-card.js';
import {
  renderAnalysisNodeDetails,
  renderProposalAnalysisPanel,
} from '../src/ui/proposal-analysis-panel.js';

class TestElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.className = '';
    this.textContent = '';
    this.href = '';
    this.target = '';
    this.rel = '';
    this.type = '';
    this.listeners = {};
    this.style = {};
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

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      if (!(node instanceof TestElement)) return;
      if (selector.startsWith('.')) {
        const className = selector.slice(1);
        if (node.className.split(/\s+/).includes(className)) matches.push(node);
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
    createElementNS: (_ns, tagName) => new TestElement(tagName),
  };
  try {
    return fn();
  } finally {
    globalThis.document = original;
  }
}

const analysis = {
  summary: { criticalCount: 0, warningCount: 2, infoCount: 1, manualReviewCount: 0 },
  issues: [
    { severity: 'warning', title: 'Node is already assigned', message: 'Assigned elsewhere.' },
    { severity: 'info', title: 'Country diversity decreases', message: 'Country count decreases.' },
  ],
  stateChange: {
    beforeNodeIds: ['a'],
    afterNodeIds: ['b'],
    addedNodeIds: ['b'],
    removedNodeIds: ['a'],
  },
  metrics: {
    diversity: {
      before: { nodeProviders: 2, nodeOperators: 2, dataCenters: 2, countries: 2 },
      after: { nodeProviders: 1, nodeOperators: 2, dataCenters: 2, countries: 1 },
    },
    dfinityProvider: { beforeCount: 1, afterCount: 0 },
  },
};

function proposal() {
  return {
    id: 123n,
    title: 'Proposal title',
    rewardStatusKind: 'accepting-votes',
    rewardStatusLabel: 'Accepting votes',
    deadlineTimestampSeconds: null,
    deadlineCountdownPercent: 0,
    deadlineProgressPercent: 0,
    deadlineUrgencyLevel: 'safe',
    tally: null,
    analysis,
  };
}

test('proposal card renders issue counts', () => withDocument(() => {
  const card = renderProposalCard(proposal());
  assert.match(card.getTextContent(), /2 warnings/);
  assert.match(card.getTextContent(), /Node is already assigned/);
}));

test('proposal detail renders grouped issues', () => withDocument(() => {
  const panel = renderProposalAnalysisPanel(analysis);
  assert.match(panel.getTextContent(), /Proposal analysis/);
  assert.match(panel.getTextContent(), /Warnings/);
  assert.match(panel.getTextContent(), /Informational findings/);
  assert.match(panel.getTextContent(), /Node providers/);
}));

test('node detail copy buttons use textContent and Globalping link is external manual', () => withDocument(() => {
  const panel = renderAnalysisNodeDetails({
    nodeId: 'node-1',
    currentSubnetId: 'subnet-1',
    nodeProviderId: 'provider-1',
    nodeOperatorId: 'operator-1',
    dataCenterId: 'dc-1',
    dataCenterOwner: 'owner',
    dataCenterRegion: 'region',
    gps: { latitude: 1, longitude: 2 },
    publicIpv4: { ipAddr: '203.0.113.10' },
    publicIpv6: { ipAddr: '2001:db8::10' },
    domain: 'node.example.com',
    httpEndpoint: '2001:db8::1:8080',
  });
  assert.match(panel.getTextContent(), /Copy IPv4/);
  assert.match(panel.getTextContent(), /Copy IPv6/);
  assert.match(panel.getTextContent(), /2001:db8::10/);
  assert.match(panel.getTextContent(), /Copy domain/);
  const link = panel.querySelector('a');
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'noopener noreferrer');
  assert.match(link.textContent, /Manual external check/);
  assert.match(link.textContent, /Not used by NNX validation/);
}));
