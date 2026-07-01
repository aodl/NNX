import {
  applyTheme,
  initializeTheme,
  nextExplicitTheme,
  persistThemePreference,
} from './theme.js';

export function createThemeToggle({
  storage = globalThis.localStorage,
  matchMediaRef = globalThis.matchMedia,
  documentRef = globalThis.document,
} = {}) {
  let state = initializeTheme({ storage, matchMediaRef, documentRef });
  const button = documentRef.createElement('button');
  button.className = 'theme-toggle';
  button.type = 'button';

  function sync() {
    button.setAttribute('aria-pressed', state.theme === 'dark' ? 'true' : 'false');
    button.setAttribute('aria-label', `Switch to ${state.theme === 'dark' ? 'light' : 'dark'} theme`);
    button.textContent = state.theme === 'dark' ? 'Light' : 'Dark';
  }

  button.addEventListener('click', () => {
    const preference = nextExplicitTheme(state.theme);
    persistThemePreference(preference, { storage });
    state = { preference, theme: applyTheme(preference, documentRef) };
    sync();
  });

  sync();
  return button;
}
