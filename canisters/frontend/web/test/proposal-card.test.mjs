import assert from 'node:assert/strict';
import test from 'node:test';
import { renderProposalCard } from '../src/ui/proposal-card.js';

class TestElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.style = {};
    this.className = '';
    this.textContent = '';
    this.href = '';
  }

  append(...children) {
    this.children.push(...children);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const className = selector.startsWith('.') ? selector.slice(1) : null;
    const matches = [];
    const visit = (node) => {
      if (!(node instanceof TestElement)) {
        return;
      }
      const classes = node.className.split(/\s+/).filter(Boolean);
      if (className && classes.includes(className)) {
        matches.push(node);
      }
      for (const child of node.children) {
        visit(child);
      }
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

function withTestDocument(fn) {
  const originalDocument = globalThis.document;
  globalThis.document = {
    createElement: (tagName) => new TestElement(tagName),
    createElementNS: (_namespace, tagName) => new TestElement(tagName),
  };

  try {
    return fn();
  } finally {
    globalThis.document = originalDocument;
  }
}

function proposalWithTally(tally) {
  return {
    id: 123n,
    title: 'Proposal title',
    statusKind: 'open',
    statusLabel: 'Open',
    deadlineTimestampSeconds: null,
    deadlineUrgencyPercent: 0,
    deadlineUrgencyLevel: 'unavailable',
    tally,
  };
}

test('proposal card vote bar uses yes/no vote split without uncast power', () => withTestDocument(() => {
  const card = renderProposalCard(proposalWithTally({
    yes: 25n,
    no: 75n,
    total: 1000n,
    votedYesNoTotal: 100n,
    uncast: 900n,
    yesPercent: 2.5,
    noPercent: 7.5,
    uncastPercent: 90,
    yesVotePercent: 25,
    noVotePercent: 75,
  }));

  const bar = card.querySelector('.vote-split-bar');
  const yes = bar.querySelector('.vote-split-yes');
  const no = bar.querySelector('.vote-split-no');

  assert.equal(yes.style.width, '25%');
  assert.equal(no.style.width, '75%');
  assert.equal(bar.querySelector('.vote-split-uncast'), null);
  assert.deepEqual(
    bar.children.map((child) => child.className),
    ['vote-split-yes', 'vote-split-no'],
  );
}));

test('proposal card vote bar shows empty state when no yes/no votes are recorded', () => withTestDocument(() => {
  const card = renderProposalCard(proposalWithTally({
    yes: 0n,
    no: 0n,
    total: 1000n,
    votedYesNoTotal: 0n,
    uncast: 1000n,
    yesPercent: 0,
    noPercent: 0,
    uncastPercent: 100,
    yesVotePercent: 0,
    noVotePercent: 0,
  }));

  assert.equal(card.querySelector('.vote-split-yes').style.width, '0%');
  assert.equal(card.querySelector('.vote-split-no').style.width, '0%');
  assert.equal(card.querySelector('.vote-split-uncast'), null);
  assert.match(card.getTextContent(), /No votes recorded yet/);
}));
