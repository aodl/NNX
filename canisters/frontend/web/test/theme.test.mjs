import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyTheme,
  initializeTheme,
  nextExplicitTheme,
  persistThemePreference,
  readThemePreference,
  resolveThemePreference,
  THEME_STORAGE_KEY,
} from '../src/ui/theme.js';
import { createThemeToggle } from '../src/ui/theme-toggle.js';

function storage({ throws = false } = {}) {
  const map = new Map();
  return {
    getItem(key) {
      if (throws) throw new Error('blocked');
      return map.get(key) ?? null;
    },
    setItem(key, value) {
      if (throws) throw new Error('blocked');
      map.set(key, value);
    },
    map,
  };
}

function documentStub() {
  const attrs = new Map();
  const styles = new Map();
  return {
    documentElement: {
      setAttribute: (key, value) => attrs.set(key, value),
      style: { setProperty: (key, value) => styles.set(key, value) },
    },
    createElement(tag) {
      const listeners = new Map();
      return {
        tag,
        className: '',
        type: '',
        textContent: '',
        attributes: new Map(),
        setAttribute(key, value) { this.attributes.set(key, value); },
        getAttribute(key) { return this.attributes.get(key); },
        addEventListener(event, fn) { listeners.set(event, fn); },
        click() { listeners.get('click')?.(); },
      };
    },
    attrs,
    styles,
  };
}

test('theme preference resolution honors system preference', () => {
  const result = resolveThemePreference({
    storedPreference: null,
    matchMediaRef: () => ({ matches: true }),
  });
  assert.equal(result.preference, 'system');
  assert.equal(result.theme, 'dark');
});

test('theme preference persists to localStorage', () => {
  const local = storage();
  assert.equal(persistThemePreference('dark', { storage: local }), true);
  assert.equal(local.map.get(THEME_STORAGE_KEY), 'dark');
  assert.equal(readThemePreference({ storage: local }).theme, 'dark');
});

test('theme storage fallback handles unavailable localStorage', () => {
  const doc = documentStub();
  const result = initializeTheme({
    storage: storage({ throws: true }),
    matchMediaRef: () => ({ matches: false }),
    documentRef: doc,
  });
  assert.equal(result.theme, 'light');
  assert.equal(doc.attrs.get('data-theme'), 'light');
});

test('theme toggle button label and aria state update', () => {
  const doc = documentStub();
  const local = storage();
  applyTheme('light', doc);
  const button = createThemeToggle({
    storage: local,
    matchMediaRef: () => ({ matches: false }),
    documentRef: doc,
  });
  assert.equal(button.textContent, 'Dark');
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  button.click();
  assert.equal(button.textContent, 'Light');
  assert.equal(button.getAttribute('aria-pressed'), 'true');
});

test('theme cycle toggles explicit light and dark', () => {
  assert.equal(nextExplicitTheme('light'), 'dark');
  assert.equal(nextExplicitTheme('dark'), 'light');
});
