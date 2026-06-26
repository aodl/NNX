import { formatIcpFromE8s, formatNeuronId, formatPrincipal } from '../app/view-formatters.js';
import { renderNotFoundPage } from './not-found-page.js';
import { renderTopicTable } from './topic-table.js';

function setNotice(root, title, message) {
  root.className = 'shell';
  root.innerHTML = '';
  const section = document.createElement('section');
  section.className = 'notice';
  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'Network Nexus';
  const h1 = document.createElement('h1');
  h1.textContent = title;
  const p = document.createElement('p');
  p.textContent = message;
  section.append(eyebrow, h1, p);
  root.append(section);
}

function metric(label, value) {
  const item = document.createElement('div');
  item.className = 'metric';
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  item.append(dt, dd);
  return item;
}

function renderSummary(neuron) {
  const list = document.createElement('dl');
  list.className = 'summary';
  list.append(
    metric('Stake', neuron.exists ? formatIcpFromE8s(neuron.stakeE8s) : '0 ICP'),
    metric('Visibility', neuron.public ? 'Public' : 'Private'),
    metric('Controller', neuron.public ? formatPrincipal(neuron.controller) : 'Anonymous'),
    metric('Hotkeys', neuron.hotkeysPrivate ? 'Private' : neuron.hotkeys.join(', ') || 'None'),
  );
  return list;
}

export async function renderNeuronPage(root, { neuronId, neuronLoader }) {
  setNotice(root, 'Loading neuron', `Fetching NNS neuron ${formatNeuronId(neuronId)}.`);

  let neuron;
  try {
    neuron = await neuronLoader.loadNeuron(neuronId);
  } catch (error) {
    setNotice(root, 'Query failed', error instanceof Error ? error.message : 'Unable to query NNS Governance.');
    return;
  }

  if (!neuron.exists) {
    renderNotFoundPage(root, { missingNeuron: true });
    return;
  }

  root.className = 'shell';
  root.innerHTML = '';

  const topbar = document.createElement('header');
  topbar.className = 'topbar';
  const titleWrap = document.createElement('div');
  const brand = document.createElement('p');
  brand.className = 'brand';
  brand.textContent = 'Network Nexus';
  const title = document.createElement('h1');
  title.textContent = neuron.knownNeuronName || `Neuron ${formatNeuronId(neuron.id)}`;
  titleWrap.append(brand, title);
  if (neuron.knownNeuronName) {
    const subtitle = document.createElement('p');
    subtitle.className = 'subtitle';
    subtitle.textContent = `Neuron ${formatNeuronId(neuron.id)}`;
    titleWrap.append(subtitle);
  }
  topbar.append(titleWrap);

  const sectionTitle = document.createElement('h2');
  sectionTitle.textContent = 'Topic coverage';

  root.append(topbar, renderSummary(neuron), sectionTitle);
  root.append(await renderTopicTable({ neuron, neuronLoader }));
}
