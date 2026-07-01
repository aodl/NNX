import assert from 'node:assert/strict';
import test from 'node:test';

import { createSparkline, createStackedBar } from '../src/ui/charts.js';

function setupDocument() {
  const make = (tag) => ({
    tag,
    children: [],
    attributes: new Map(),
    style: {},
    className: '',
    setAttribute(key, value) { this.attributes.set(key, value); },
    getAttribute(key) { return this.attributes.get(key); },
    append(...items) { this.children.push(...items); },
    appendChild(item) { this.children.push(item); },
    insertBefore(item, before) {
      const index = this.children.indexOf(before);
      if (index >= 0) this.children.splice(index, 0, item);
      else this.children.push(item);
    },
    querySelector(selector) {
      return this.children.find((child) => child.attributes?.get('class') === selector.slice(1)) ?? null;
    },
    classList: { add() {} },
  });
  global.document = {
    createElement: make,
    createElementNS: (_ns, tag) => make(tag),
  };
}

test('sparkline handles empty data', () => {
  setupDocument();
  const svg = createSparkline([]);
  assert.equal(svg.getAttribute('aria-label'), 'No trend data');
});

test('sparkline handles one point', () => {
  setupDocument();
  const svg = createSparkline([5n]);
  assert.equal(svg.getAttribute('aria-label'), 'Metric trend');
});

test('sparkline handles BigInt and string numeric inputs', () => {
  setupDocument();
  const svg = createSparkline([1n, '2', 3]);
  assert.equal(svg.getAttribute('role'), 'img');
});

test('stacked bar zero total renders without division by zero', () => {
  setupDocument();
  const bar = createStackedBar([{ label: 'zero', value: 0 }]);
  assert.equal(bar.children[0].style.width, '0%');
});

test('stacked bar percentages sum safely', () => {
  setupDocument();
  const bar = createStackedBar([
    { label: 'a', value: 1 },
    { label: 'b', value: 3 },
  ]);
  const sum = bar.children.reduce((total, child) => total + Number(child.style.width.replace('%', '')), 0);
  assert.equal(Math.round(sum), 100);
});
