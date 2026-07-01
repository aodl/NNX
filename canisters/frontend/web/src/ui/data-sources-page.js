function clear(root) {
  root.className = 'shell detail-shell';
  root.innerHTML = '';
}

function section(title, items) {
  const block = document.createElement('section');
  block.className = 'data-source-section';
  const h2 = document.createElement('h2');
  h2.textContent = title;
  const list = document.createElement('ul');
  for (const item of items) {
    const li = document.createElement('li');
    li.textContent = item;
    list.append(li);
  }
  block.append(h2, list);
  return block;
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export function renderDataSourcesContent({ buildInfo = null, frontendEnv = null } = {}) {
  const main = document.createElement('main');
  main.className = 'data-sources-page';
  const header = document.createElement('header');
  const h1 = document.createElement('h1');
  h1.textContent = 'Data sources';
  const back = document.createElement('a');
  back.href = '/';
  back.textContent = 'Back to proposals';
  header.append(h1, back);
  main.append(
    header,
    section('Allowed sources', [
      'Governance: proposals, neurons, known neurons, node providers.',
      'Registry: subnets, node operators, data centers, node records.',
      'CMC: subnet placement labels.',
      'Certified state: API-boundary membership.',
      'Historian: node_metrics_history access and future bounded sampling.',
      'Manual-only tools: Globalping.',
    ]),
    section('Explicitly not used', [
      'dashboard APIs.',
      'ic-api.internetcomputer.org.',
      'CSV snapshots.',
      'scraping.',
      'IP geolocation APIs.',
      'automatic Globalping calls.',
    ]),
  );
  const build = document.createElement('section');
  build.className = 'data-source-section';
  const h2 = document.createElement('h2');
  h2.textContent = 'Staging build info';
  const dl = document.createElement('dl');
  for (const [label, value] of [
    ['Environment', buildInfo?.environment],
    ['Git commit', buildInfo?.gitCommit],
    ['Frontend canister ID', buildInfo?.frontendCanisterId],
    ['Historian canister ID', buildInfo?.historianCanisterId ?? frontendEnv?.['PUBLIC_CANISTER_ID:nnx_historian']],
    ['Build time', buildInfo?.buildTime],
    ['repoDirty', buildInfo?.repoDirty],
  ]) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value === undefined || value === null ? 'Unavailable' : value.toString();
    dl.append(dt, dd);
  }
  build.append(h2, dl);
  main.append(build);
  return main;
}

export async function renderDataSourcesPage(root) {
  clear(root);
  const loading = document.createElement('section');
  loading.className = 'notice';
  const h1 = document.createElement('h1');
  h1.textContent = 'Loading data sources';
  loading.append(h1);
  root.append(loading);
  const [buildInfo, frontendEnv] = await Promise.all([
    fetchJson('/generated/build-info.json').catch(() => null),
    fetchJson('/generated/frontend-env.json').catch(() => null),
  ]);
  clear(root);
  root.append(renderDataSourcesContent({ buildInfo, frontendEnv }));
}

