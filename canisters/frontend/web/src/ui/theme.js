export const THEME_STORAGE_KEY = 'nnx.theme';
export const THEMES = Object.freeze({
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
});

function storageGet(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

function storageSet(storage, key, value) {
  try {
    storage?.setItem?.(key, value);
    return true;
  } catch {
    return false;
  }
}

export function systemTheme(matchMediaRef = globalThis.matchMedia) {
  try {
    return matchMediaRef?.('(prefers-color-scheme: dark)')?.matches ? THEMES.DARK : THEMES.LIGHT;
  } catch {
    return THEMES.LIGHT;
  }
}

export function normalizeThemePreference(value) {
  return value === THEMES.LIGHT || value === THEMES.DARK || value === THEMES.SYSTEM
    ? value
    : THEMES.SYSTEM;
}

export function resolveThemePreference({
  storedPreference = null,
  matchMediaRef = globalThis.matchMedia,
} = {}) {
  const preference = normalizeThemePreference(storedPreference);
  return {
    preference,
    theme: preference === THEMES.SYSTEM ? systemTheme(matchMediaRef) : preference,
  };
}

export function readThemePreference({
  storage = globalThis.localStorage,
  matchMediaRef = globalThis.matchMedia,
} = {}) {
  return resolveThemePreference({
    storedPreference: storageGet(storage, THEME_STORAGE_KEY),
    matchMediaRef,
  });
}

export function persistThemePreference(preference, {
  storage = globalThis.localStorage,
} = {}) {
  return storageSet(storage, THEME_STORAGE_KEY, normalizeThemePreference(preference));
}

export function applyTheme(theme, documentRef = globalThis.document) {
  const resolved = theme === THEMES.DARK ? THEMES.DARK : THEMES.LIGHT;
  documentRef?.documentElement?.setAttribute('data-theme', resolved);
  documentRef?.documentElement?.style?.setProperty('color-scheme', resolved);
  return resolved;
}

export function initializeTheme({
  storage = globalThis.localStorage,
  matchMediaRef = globalThis.matchMedia,
  documentRef = globalThis.document,
} = {}) {
  const resolved = readThemePreference({ storage, matchMediaRef });
  applyTheme(resolved.theme, documentRef);
  return resolved;
}

export function nextExplicitTheme(currentTheme) {
  return currentTheme === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK;
}
