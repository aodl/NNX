import { normalizePrincipalText } from '../data/query/principal-text.js';
import { createThemeToggle } from './theme-toggle.js';

const NAV_ITEMS = Object.freeze([
  { key: 'review', href: '/review', label: 'Review' },
  { key: 'proposals', href: '/', label: 'Proposals' },
  { key: 'subnets', href: '/', label: 'Subnets' },
  { key: 'neurons', href: '/', label: 'Neurons' },
  { key: 'tokenomics', href: '/tokenomics', label: 'Tokenomics' },
  { key: 'data_sources', href: '/data-sources', label: 'Data Sources' },
]);

function navKeyForRoute(route) {
  if (route.kind === 'proposal') return 'proposals';
  if (route.kind === 'subnet') return 'subnets';
  if (route.kind === 'neuron') return 'neurons';
  return route.kind;
}

function createLogo(documentRef) {
  const logo = documentRef.createElement('img');
  logo.className = 'nnx-logo-mark';
  logo.src = '/logo.svg';
  logo.alt = 'Network Nexus logo';
  logo.width = 42;
  logo.height = 42;
  return logo;
}

function createSearch(documentRef, windowRef) {
  const form = documentRef.createElement('form');
  form.className = 'shell-search';
  const input = documentRef.createElement('input');
  input.type = 'search';
  input.placeholder = 'Search proposal, subnet, or neuron';
  input.setAttribute('aria-label', 'Search proposal, subnet, or neuron');
  const hint = documentRef.createElement('span');
  hint.className = 'shell-search-hint';
  hint.setAttribute('role', 'status');
  form.append(input, hint);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value.trim();
    hint.textContent = '';
    if (/^(0|[1-9][0-9]*)$/.test(value)) {
      windowRef.location.assign(`/proposal/${value}`);
      return;
    }
    if (normalizePrincipalText(value) === value) {
      windowRef.location.assign(`/subnet/${value}`);
      return;
    }
    hint.textContent = 'Enter a proposal number or principal-shaped subnet ID.';
  });

  return form;
}

function shortCommit(buildInfo) {
  const commit = buildInfo?.gitCommit ?? buildInfo?.commit ?? '';
  return typeof commit === 'string' && commit.length >= 7 ? commit.slice(0, 7) : 'unknown';
}

async function attachBuildBadge(badge) {
  try {
    const response = await fetch('/generated/build-info.json', { cache: 'no-store' });
    if (!response.ok) return;
    const buildInfo = await response.json();
    badge.textContent = `build ${shortCommit(buildInfo)}`;
  } catch {
    badge.textContent = 'build unavailable';
  }
}

export function renderAppShell(root, {
  route,
  windowRef = window,
  documentRef = document,
} = {}) {
  root.className = 'app-root';
  root.textContent = '';

  const shell = documentRef.createElement('div');
  shell.className = 'app-shell';

  const header = documentRef.createElement('header');
  header.className = 'app-header';

  const brand = documentRef.createElement('a');
  brand.className = 'app-brand';
  brand.href = '/';
  brand.append(createLogo(documentRef));
  const brandText = documentRef.createElement('span');
  brandText.className = 'app-brand-text';
  const name = documentRef.createElement('strong');
  name.textContent = 'Network Nexus';
  const env = documentRef.createElement('span');
  env.className = 'environment-badge';
  env.textContent = 'Staging';
  brandText.append(name, env);
  brand.append(brandText);

  const nav = documentRef.createElement('nav');
  nav.className = 'app-nav';
  nav.setAttribute('aria-label', 'Primary');
  const activeKey = navKeyForRoute(route);
  for (const item of NAV_ITEMS) {
    const link = documentRef.createElement('a');
    link.href = item.href;
    link.textContent = item.label;
    link.className = item.key === activeKey ? 'active' : '';
    if (item.key === activeKey) link.setAttribute('aria-current', 'page');
    nav.append(link);
  }

  const tools = documentRef.createElement('div');
  tools.className = 'app-tools';
  const buildBadge = documentRef.createElement('span');
  buildBadge.className = 'build-badge';
  buildBadge.textContent = 'build ...';
  tools.append(createSearch(documentRef, windowRef), createThemeToggle({ documentRef }), buildBadge);

  header.append(brand, nav, tools);
  const content = documentRef.createElement('main');
  content.className = 'app-content';
  shell.append(header, content);
  root.append(shell);
  attachBuildBadge(buildBadge);
  return content;
}
