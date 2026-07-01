import assert from 'node:assert/strict';
import test from 'node:test';
import { renderDataSourcesContent } from '../src/ui/data-sources-page.js';

class TestElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.className = '';
    this.textContent = '';
    this.href = '';
  }

  append(...children) {
    this.children.push(...children);
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

test('data sources page renders allowed and forbidden sources', () => withDocument(() => {
  const page = renderDataSourcesContent({
    buildInfo: { environment: 'staging', gitCommit: 'abc', frontendCanisterId: 'front', repoDirty: false },
    frontendEnv: { 'PUBLIC_CANISTER_ID:nnx_historian': 'hist' },
  });
  const text = page.getTextContent();
  for (const expected of [
    'Governance',
    'Registry',
    'CMC',
    'Certified state',
    'Historian',
    'dashboard APIs',
    'ic-api.internetcomputer.org',
    'CSV snapshots',
    'scraping',
    'IP geolocation',
    'automatic Globalping',
    'staging',
    'front',
    'hist',
  ]) {
    assert.match(text, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
}));

test('data sources build-info failure degrades gracefully', () => withDocument(() => {
  const page = renderDataSourcesContent();
  assert.match(page.getTextContent(), /Unavailable/);
}));

