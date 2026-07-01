import assert from 'node:assert/strict';
import test from 'node:test';

import { renderAppShell } from '../src/ui/app-shell.js';

function element(tag) {
  const children = [];
  const attrs = new Map();
  const classList = {
    values: new Set(),
    add(value) { classList.values.add(value); },
  };
  const node = {
    tag,
    children,
    attributes: attrs,
    className: '',
    href: '',
    type: '',
    textContent: '',
    style: { setProperty() {} },
    dataset: {},
    classList,
    append(...items) { children.push(...items); },
    prepend(...items) { children.unshift(...items); },
    setAttribute(key, value) { attrs.set(key, value); },
    getAttribute(key) { return attrs.get(key); },
    addEventListener() {},
    querySelector(selector) {
      const stack = [...children];
      while (stack.length) {
        const item = stack.shift();
        if (selector.startsWith('.') && item.className?.split(' ').includes(selector.slice(1))) return item;
        stack.push(...(item.children ?? []));
      }
      return null;
    },
  };
  return node;
}

function documentStub() {
  return {
    documentElement: element('html'),
    createElement: element,
    createElementNS: (_ns, tag) => element(tag),
  };
}

test('shell renders brand, nav links, theme toggle, and active nav item', () => {
  const doc = documentStub();
  const root = element('main');
  const content = renderAppShell(root, {
    route: { kind: 'tokenomics' },
    documentRef: doc,
    windowRef: { location: { assign() {} } },
  });
  assert.equal(content.tag, 'main');
  assert.ok(root.querySelector('.app-brand'));
  assert.ok(root.querySelector('.theme-toggle'));
  const active = root.querySelector('.active');
  assert.equal(active?.textContent, 'Tokenomics');
  assert.equal(active?.getAttribute('aria-current'), 'page');
});

test('app shell source does not use unsafe innerHTML', async () => {
  const source = await import('node:fs/promises')
    .then((fs) => fs.readFile(new URL('../src/ui/app-shell.js', import.meta.url), 'utf8'));
  assert.equal(source.includes('innerHTML'), false);
});
