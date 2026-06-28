import { NNS_TOPICS } from '../topics.js';
import { TOPOLOGY_ERROR_CODES, topologyWarning } from '../topology/topology-errors.js';

const MAX_DATE_MS = 8_640_000_000_000_000n;
const PROPOSAL_URGENCY_WINDOW_SECONDS = 48n * 60n * 60n;
const PROPOSAL_URGENCY_WARNING_SECONDS = 6n * 60n * 60n;

function unwrapOpt(value) {
  return Array.isArray(value) ? (value.length === 0 ? null : value[0]) : value ?? null;
}

function neuronIdValue(value) {
  const unwrapped = unwrapOpt(value);
  if (unwrapped === null || unwrapped === undefined) return null;
  if (typeof unwrapped === 'bigint') return unwrapped;
  if (typeof unwrapped === 'object' && 'id' in unwrapped) return BigInt(unwrapped.id);
  return BigInt(unwrapped);
}

function principalText(value) {
  const unwrapped = unwrapOpt(value);
  return unwrapped ? unwrapped.toString() : null;
}

function nat64OrNull(value) {
  const unwrapped = unwrapOpt(value);
  if (unwrapped === null || unwrapped === undefined) return null;
  return BigInt(unwrapped);
}

function int32Value(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  return Number(value);
}

function dateFromTimestampSeconds(seconds) {
  if (seconds === null) return null;
  const milliseconds = seconds * 1000n;
  if (milliseconds < -MAX_DATE_MS || milliseconds > MAX_DATE_MS) return null;
  return new Date(Number(milliseconds));
}

function timeRemaining(deadlineTimestampSeconds) {
  if (deadlineTimestampSeconds === null) return null;
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  const remaining = deadlineTimestampSeconds - nowSeconds;
  if (remaining <= 0n) return 0;
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  return remaining > maxSafe ? Number.MAX_SAFE_INTEGER : Number(remaining);
}

function topicLabel(topicId) {
  return NNS_TOPICS.find((topic) => topic.id === topicId)?.label ?? `Topic ${topicId}`;
}

function proposalTitle(proposal) {
  const title = unwrapOpt(proposal?.title);
  if (typeof title === 'string' && title.trim()) return title.trim();
  const summary = proposal?.summary;
  if (typeof summary === 'string' && summary.trim()) {
    return summary.trim().split(/\s+/).slice(0, 12).join(' ');
  }
  return 'Untitled proposal';
}

function proposalStatus(value) {
  switch (int32Value(value)) {
    case 1:
      return { statusLabel: 'Open', statusKind: 'open' };
    case 2:
      return { statusLabel: 'Rejected', statusKind: 'rejected' };
    case 3:
      return { statusLabel: 'Adopted', statusKind: 'adopted' };
    case 4:
      return { statusLabel: 'Executed', statusKind: 'executed' };
    case 5:
      return { statusLabel: 'Failed', statusKind: 'failed' };
    default:
      return { statusLabel: 'Unknown', statusKind: 'unknown' };
  }
}

function proposalRewardStatus(value) {
  switch (int32Value(value)) {
    case 1:
      return 'Accepting votes';
    case 2:
      return 'Ready to settle';
    case 3:
      return 'Settled';
    case 4:
      return 'Ineligible';
    default:
      return 'Unknown';
  }
}

function normalizeTally(tally) {
  const unwrapped = unwrapOpt(tally);
  if (!unwrapped) return null;

  const yes = BigInt(unwrapped.yes ?? 0n);
  const no = BigInt(unwrapped.no ?? 0n);
  const total = BigInt(unwrapped.total ?? 0n);
  const votedYesNoTotal = yes + no;
  const uncast = total > votedYesNoTotal ? total - votedYesNoTotal : 0n;
  const yesPercent = total === 0n ? 0 : Number((yes * 10_000n) / total) / 100;
  const noPercent = total === 0n ? 0 : Number((no * 10_000n) / total) / 100;
  const uncastPercent = total === 0n ? 0 : Number((uncast * 10_000n) / total) / 100;
  const yesVotePercent = votedYesNoTotal === 0n
    ? 0
    : Number((yes * 10_000n) / votedYesNoTotal) / 100;
  const noVotePercent = votedYesNoTotal === 0n
    ? 0
    : Number((no * 10_000n) / votedYesNoTotal) / 100;

  return {
    yes,
    no,
    total,
    votedYesNoTotal,
    uncast,
    yesPercent,
    noPercent,
    uncastPercent,
    yesVotePercent,
    noVotePercent,
  };
}

function deadlineUrgency(timeRemainingSecondsValue) {
  if (timeRemainingSecondsValue === null) {
    return {
      deadlineUrgencyPercent: 0,
      deadlineUrgencyLevel: 'unavailable',
    };
  }

  if (timeRemainingSecondsValue <= 0) {
    return {
      deadlineUrgencyPercent: 100,
      deadlineUrgencyLevel: 'expired',
    };
  }

  const remaining = BigInt(Math.floor(timeRemainingSecondsValue));
  const rawPercent = remaining >= PROPOSAL_URGENCY_WINDOW_SECONDS
    ? 6
    : Number(((PROPOSAL_URGENCY_WINDOW_SECONDS - remaining) * 10_000n)
      / PROPOSAL_URGENCY_WINDOW_SECONDS) / 100;
  const deadlineUrgencyPercent = Math.max(0, Math.min(100, rawPercent));
  const deadlineUrgencyLevel = remaining <= PROPOSAL_URGENCY_WARNING_SECONDS
    ? 'warning'
    : 'safe';

  return { deadlineUrgencyPercent, deadlineUrgencyLevel };
}

function selfDescribingValueText(value, depth = 0) {
  const unwrapped = unwrapOpt(value);
  if (unwrapped === null || unwrapped === undefined) return null;
  if (typeof unwrapped !== 'object') return unwrapped.toString();

  if ('Text' in unwrapped) return unwrapped.Text;
  if ('Bool' in unwrapped) return unwrapped.Bool ? 'True' : 'False';
  if ('Nat' in unwrapped) return unwrapped.Nat.toString();
  if ('Int' in unwrapped) return unwrapped.Int.toString();
  if ('Blob' in unwrapped) return `${unwrapped.Blob.length} bytes`;
  if ('Null' in unwrapped) return 'None';

  if ('Array' in unwrapped) {
    const items = unwrapped.Array
      .map((item) => selfDescribingValueText(item, depth + 1))
      .filter(Boolean);
    return items.length ? items.join(depth === 0 ? '\n' : ', ') : null;
  }

  if ('Map' in unwrapped) {
    const indent = '  '.repeat(depth);
    const lines = unwrapped.Map
      .map(([key, item]) => {
        const itemText = selfDescribingValueText(item, depth + 1);
        return itemText ? `${indent}${key}: ${itemText}` : null;
      })
      .filter(Boolean);
    return lines.length ? lines.join('\n') : null;
  }

  return null;
}

function selfDescribingValueEntries(value) {
  const unwrapped = unwrapOpt(value);
  if (!unwrapped || typeof unwrapped !== 'object' || !('Map' in unwrapped)) return [];
  return unwrapped.Map
    .map(([name, item]) => {
      const itemText = selfDescribingValueText(item, 0);
      return itemText ? { name, value: itemText } : null;
    })
    .filter(Boolean);
}

function collectSearchText(value, output = [], seen = new Set()) {
  if (value === null || value === undefined) return output;

  if (Array.isArray(value)) {
    for (const item of value) {
      collectSearchText(item, output, seen);
    }
    return output;
  }

  if (typeof value === 'string') {
    output.push(value);
    return output;
  }
  if (['bigint', 'number', 'boolean'].includes(typeof value)) {
    output.push(value.toString());
    return output;
  }
  if (typeof value !== 'object') return output;
  if (seen.has(value)) return output;
  seen.add(value);

  if (typeof value.toText === 'function') {
    output.push(value.toText());
    return output;
  }
  if (ArrayBuffer.isView(value)) return output;

  for (const [key, item] of Object.entries(value)) {
    output.push(key);
    collectSearchText(item, output, seen);
  }
  return output;
}

function proposalPayloadSearchText(proposal) {
  const parts = collectSearchText([
    proposal?.action,
    proposal?.self_describing_action,
  ]);
  return parts.join('\n');
}

function proposalSelfDescribingAction(proposal) {
  const action = unwrapOpt(proposal?.self_describing_action);
  if (!action) {
    return {
      actionTypeName: null,
      actionDescription: 'Action unavailable.',
      actionDetails: null,
      actionValues: [],
      payloadSearchText: proposalPayloadSearchText(proposal),
    };
  }

  const typeName = unwrapOpt(action.type_name);
  const description = unwrapOpt(action.type_description);
  const actionValues = selfDescribingValueEntries(action.value);
  const details = actionValues.length === 0 ? selfDescribingValueText(action.value) : null;

  return {
    actionTypeName: typeof typeName === 'string' && typeName.trim() ? typeName.trim() : null,
    actionDescription: typeof description === 'string' && description.trim()
      ? description.trim()
      : 'Action description unavailable.',
    actionDetails: typeof details === 'string' && details.trim() ? details.trim() : null,
    actionValues,
    payloadSearchText: proposalPayloadSearchText(proposal),
  };
}

function visibilityOf(fullNeuron, info) {
  const raw = unwrapOpt(fullNeuron?.visibility) ?? unwrapOpt(info?.visibility);
  if (raw === 2 || raw === 2n) return 'public';
  if (raw === 1 || raw === 1n) return 'private';
  return fullNeuron ? 'public' : 'unknown';
}

function fullNeuronId(fullNeuron) {
  return neuronIdValue(fullNeuron?.id);
}

function knownNeuronName(info, fallbackName = null) {
  const data = unwrapOpt(info?.known_neuron_data);
  return data?.name || fallbackName;
}

function normalizeNeuron(id, fullNeuron, info, knownNeuronNames) {
  const visibility = visibilityOf(fullNeuron, info);
  const isPublic = Boolean(fullNeuron);
  const stake = info?.stake_e8s ?? fullNeuron?.cached_neuron_stake_e8s ?? 0n;
  const controller = isPublic ? principalText(fullNeuron?.controller) : null;
  const knownName = knownNeuronNames.get(id.toString()) ?? null;
  const hotkeys = isPublic ? (fullNeuron.hot_keys ?? []).map((principal) => principal.toString()) : [];

  return {
    id,
    exists: true,
    visibility,
    public: isPublic,
    stakeE8s: BigInt(stake),
    controller,
    controllerLabel: controller ?? 'Anonymous',
    hotkeys,
    hotkeysPrivate: !isPublic,
    followeesPrivate: !isPublic,
    knownNeuronName: knownNeuronName(info, knownName),
    fullNeuron: fullNeuron ?? null,
    info: info ?? null,
  };
}

export function normalizeNeuronListResponse(response, requestedIds, knownNeuronNames = new Map()) {
  const fullById = new Map();
  for (const neuron of response.full_neurons ?? []) {
    const id = fullNeuronId(neuron);
    if (id !== null) fullById.set(id.toString(), neuron);
  }

  const infoById = new Map();
  for (const [id, info] of response.neuron_infos ?? []) {
    infoById.set(BigInt(id).toString(), info);
  }

  return requestedIds.map((id) => {
    const key = id.toString();
    const fullNeuron = fullById.get(key) ?? null;
    const info = infoById.get(key) ?? null;
    if (!fullNeuron && !info) {
      return { id, exists: false, knownNeuronName: knownNeuronNames.get(key) ?? null };
    }
    return normalizeNeuron(id, fullNeuron, info, knownNeuronNames);
  });
}

export function normalizeKnownNeuronNamesResponse(response) {
  const names = new Map();
  for (const known of response.known_neurons ?? []) {
    const id = neuronIdValue(known?.id);
    const data = unwrapOpt(known?.known_neuron_data);
    if (id !== null && data?.name) {
      names.set(id.toString(), data.name);
    }
  }
  return names;
}

export function normalizeProposalInfo(proposalInfo, knownNeuronNames = new Map()) {
  const id = neuronIdValue(proposalInfo?.id) ?? 0n;
  const proposal = unwrapOpt(proposalInfo?.proposal);
  const topicId = int32Value(proposalInfo?.topic);
  const deadlineTimestampSeconds = nat64OrNull(proposalInfo?.deadline_timestamp_seconds);
  const remainingSeconds = timeRemaining(deadlineTimestampSeconds);
  const proposerNeuronId = neuronIdValue(proposalInfo?.proposer);
  const proposerKnownNeuronName = proposerNeuronId === null
    ? null
    : knownNeuronNames.get(proposerNeuronId.toString()) ?? null;
  const status = int32Value(proposalInfo?.status);
  const rewardStatus = int32Value(proposalInfo?.reward_status);
  const action = proposalSelfDescribingAction(proposal);

  return {
    id,
    title: proposalTitle(proposal),
    summary: proposal?.summary ?? '',
    url: proposal?.url ?? '',
    ...action,
    topicId,
    topicLabel: topicLabel(topicId),
    status,
    ...proposalStatus(status),
    rewardStatus,
    rewardStatusLabel: proposalRewardStatus(rewardStatus),
    proposerNeuronId,
    proposerKnownNeuronName,
    createdAtSeconds: BigInt(proposalInfo?.proposal_timestamp_seconds ?? 0n),
    decidedAtSeconds: BigInt(proposalInfo?.decided_timestamp_seconds ?? 0n),
    deadlineTimestampSeconds,
    deadlineDate: dateFromTimestampSeconds(deadlineTimestampSeconds),
    timeRemainingSeconds: remainingSeconds,
    ...deadlineUrgency(remainingSeconds),
    tally: normalizeTally(proposalInfo?.latest_tally),
  };
}

export function normalizeOpenProposalListResponse(response, knownNeuronNames = new Map()) {
  return (response ?? []).map((proposalInfo) => normalizeProposalInfo(proposalInfo, knownNeuronNames));
}

export function normalizeCmcSubnetLabelsResponse(response) {
  const labelsBySubnetId = {};
  const warnings = [];

  for (const [label, subnets] of response?.data ?? []) {
    if (typeof label !== 'string' || label.length === 0) continue;
    for (const subnet of subnets ?? []) {
      const subnetId = typeof subnet?.toText === 'function'
        ? subnet.toText()
        : (typeof subnet === 'string' ? subnet : null);
      if (!subnetId) {
        warnings.push(topologyWarning(
          TOPOLOGY_ERROR_CODES.VALIDATION_FAILED,
          'CMC returned a subnet label assignment without a valid subnet principal.',
          { label },
        ));
        continue;
      }
      if (labelsBySubnetId[subnetId] && labelsBySubnetId[subnetId] !== label) {
        warnings.push(topologyWarning(
          TOPOLOGY_ERROR_CODES.VALIDATION_FAILED,
          'CMC returned multiple labels for one subnet; keeping the first label.',
          { subnetId, firstLabel: labelsBySubnetId[subnetId], ignoredLabel: label },
        ));
        continue;
      }
      labelsBySubnetId[subnetId] = label;
    }
  }

  return { labelsBySubnetId, warnings };
}

export function normalizeCmcDefaultSubnetsResponse(response) {
  const defaultSubnetIds = [];
  const warnings = [];

  for (const subnet of response ?? []) {
    const subnetId = typeof subnet?.toText === 'function'
      ? subnet.toText()
      : (typeof subnet === 'string' ? subnet : null);
    if (!subnetId) {
      warnings.push(topologyWarning(
        TOPOLOGY_ERROR_CODES.VALIDATION_FAILED,
        'CMC returned a default subnet without a valid subnet principal.',
      ));
      continue;
    }
    defaultSubnetIds.push(subnetId);
  }

  return { defaultSubnetIds, warnings };
}
