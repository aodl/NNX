import { affectedProposalsForSubnet } from '../data/proposal-subnet-impacts.js';
import { renderNotFoundPage } from './not-found-page.js';
import { renderNodeGlobePanel } from './node-globe-panel.js';
import { renderProposalPanel } from './proposal-list-panel.js';
import { formatSubnetType, capitalizeFirstLetter } from './subnet-formatters.js';

function clear(root) {
  root.className = 'shell detail-shell';
  root.innerHTML = '';
}

function metric(label, value) {
  const item = document.createElement('div');
  item.className = 'subnet-metric';
  const term = document.createElement('dt');
  term.textContent = label;
  const description = document.createElement('dd');
  description.textContent = value;
  item.append(term, description);
  return item;
}

function renderMap(locationGroups) {
  const groupsWithGps = locationGroups.filter((group) => group.gps);
  return renderNodeGlobePanel({
    locationGroups,
    title: null,
    caption: groupsWithGps.length > 0
      ? `${groupsWithGps.length} data center location${groupsWithGps.length === 1 ? '' : 's'} from Registry GPS metadata`
      : 'No Registry GPS metadata is available for this subnet.',
    ariaLabel: 'Globe showing subnet node data center locations',
  });
}

function renderWarnings(warnings) {
  if (!warnings?.length) return null;
  const details = document.createElement('details');
  details.className = 'detail-section subnet-warning-section';
  const summary = document.createElement('summary');
  summary.textContent = `${warnings.length} data warning${warnings.length === 1 ? '' : 's'}`;
  const list = document.createElement('ul');
  list.className = 'subnet-warning-list';
  for (const warning of warnings) {
    const item = document.createElement('li');
    item.textContent = warning?.message ?? String(warning);
    list.append(item);
  }
  details.append(summary, list);
  return details;
}

function renderProposalLoadErrorPanel() {
  const panel = document.createElement('section');
  panel.className = 'proposal-panel subnet-proposal-panel';
  const header = document.createElement('div');
  header.className = 'proposal-panel-header';
  const title = document.createElement('h2');
  title.className = 'proposal-panel-title';
  title.textContent = 'Proposals affecting this subnet';
  header.append(title);
  const message = document.createElement('p');
  message.className = 'muted';
  message.textContent = 'Proposal data is unavailable.';
  panel.append(header, message);
  return panel;
}

function renderSubnetDetails({
  subnet,
  locationGroups,
  warnings,
  affectedProposals = [],
  proposalLoadError = null,
}) {
  const shell = document.createElement('main');
  shell.className = 'subnet-detail-page';

  const back = document.createElement('a');
  back.className = 'back-link';
  back.href = '/';
  back.textContent = 'Back to dashboard';

  const header = document.createElement('header');
  header.className = 'subnet-detail-header';
  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'IC Subnet';
  const title = document.createElement('h1');
  title.textContent = subnet.cmcLabel
    ? `${capitalizeFirstLetter(subnet.cmcLabel)} subnet`
    : `${formatSubnetType(subnet.type)} subnet`;
  const id = document.createElement('p');
  id.className = 'subnet-detail-id';
  id.textContent = subnet.id;
  header.append(eyebrow, title, id);

  const metrics = document.createElement('dl');
  metrics.className = 'subnet-metrics';
  metrics.append(
    metric('Nodes', subnet.nodeCount.toString()),
    metric('Registry type', subnet.registryTypeLabel ?? formatSubnetType(subnet.type)),
    metric('Placement', subnet.visibilityLabel ?? 'Unknown'),
    metric('Replica version', subnet.replicaVersionId ?? 'Unavailable'),
    metric('Status', subnet.isHalted ? 'Halted' : 'Running'),
  );

  shell.append(back, header, metrics, renderMap(locationGroups));
  shell.append(proposalLoadError
    ? renderProposalLoadErrorPanel()
    : renderProposalPanel({
      proposals: affectedProposals,
      title: 'Proposals affecting this subnet',
      emptyText: 'There are currently no accepting-votes proposals that reference this subnet.',
      statusText: 'Accepting votes',
      grouped: false,
      className: 'proposal-panel subnet-proposal-panel',
    }));
  const warningSection = renderWarnings(warnings);
  if (warningSection) shell.append(warningSection);
  return shell;
}

export async function renderSubnetPage(root, { subnetId, subnetLoader, proposalLoader = null }) {
  clear(root);
  const loading = document.createElement('section');
  loading.className = 'notice';
  const title = document.createElement('h1');
  title.textContent = 'Loading subnet';
  loading.append(title);
  root.append(loading);

  let detail;
  try {
    detail = await subnetLoader.loadSubnetDetails(subnetId);
  } catch {
    clear(root);
    const error = document.createElement('section');
    error.className = 'notice';
    const h1 = document.createElement('h1');
    h1.textContent = 'Unable to load subnet';
    const p = document.createElement('p');
    p.textContent = 'The Registry query failed.';
    error.append(h1, p);
    root.append(error);
    return;
  }

  if (!detail.subnet) {
    renderNotFoundPage(root);
    return;
  }

  let affectedProposals = [];
  let proposalLoadError = null;
  if (proposalLoader) {
    try {
      affectedProposals = affectedProposalsForSubnet(
        detail.subnet.id,
        await proposalLoader.loadOpenProposals(),
      );
    } catch (error) {
      proposalLoadError = error;
    }
  }

  clear(root);
  root.append(renderSubnetDetails({ ...detail, affectedProposals, proposalLoadError }));
}
