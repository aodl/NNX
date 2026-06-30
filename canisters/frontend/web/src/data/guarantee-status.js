import { GUARANTEE_ANCHOR_NEURONS, MAX_GUARANTEE_DEPTH } from '../app/config.js';
import { getEffectiveFollowees } from './effective-followees.js';

const ANCHORS = new Set(Object.values(GUARANTEE_ANCHOR_NEURONS).map((id) => id.toString()));
const OMEGA_REJECT_ID = GUARANTEE_ANCHOR_NEURONS.omegaReject.toString();
const YES_ANCHORS = new Set([
  GUARANTEE_ANCHOR_NEURONS.alphaVote.toString(),
  GUARANTEE_ANCHOR_NEURONS.omegaVote.toString(),
]);

function result(status, reason = null, extra = {}) {
  return {
    status,
    reason,
    blockingFolloweeId: null,
    depthLimitReached: reason === 'depth_limit',
    children: [],
    ...extra,
  };
}

function neuronProofFields(neuron) {
  return {
    neuronId: neuron.id,
    knownNeuronName: neuron.knownNeuronName ?? null,
    hotkeys: neuron.hotkeys ?? [],
    hotkeysPrivate: neuron.hotkeysPrivate ?? !neuron.public,
  };
}

function mergeChildren(neuron, children) {
  const parent = neuronProofFields(neuron);
  const total = children.length;
  const yes = children.filter((child) => child.status === 'guaranteed_yes').length;
  const no = children.filter((child) => child.status === 'guaranteed_no').length;
  if (yes * 2 > total) return result('guaranteed_yes', null, { ...parent, children });
  if (no * 2 >= total) return result('guaranteed_no', null, { ...parent, children });

  const unresolved = children.find((child) => child.status === 'unknown' || child.status === 'private');
  if (unresolved) {
    return result('unknown', unresolved.reason ?? 'unresolved_path', {
      ...parent,
      children,
      depthLimitReached: unresolved.depthLimitReached,
    });
  }
  const blocker = children.find((child) => child.status === 'not_guaranteed');
  return result('not_guaranteed', blocker?.reason ?? 'threshold_not_met', {
    ...parent,
    children,
    blockingFolloweeId: blocker?.neuronId ?? blocker?.blockingFolloweeId ?? null,
  });
}

export async function getGuaranteeStatus({ neuron, topic, neuronLoader, maxDepth = MAX_GUARANTEE_DEPTH }) {
  return prove({ neuron, topic, neuronLoader, maxDepth, depth: 0, visited: new Set() });
}

async function prove({ neuron, topic, neuronLoader, maxDepth, depth, visited }) {
  if (!neuron.exists) return result('not_guaranteed', 'blocking_followee', neuronProofFields(neuron));
  if (neuron.followeesPrivate) return result('private');

  const key = `${neuron.id.toString()}:${topic.id}`;
  if (visited.has(key)) return result('unknown', 'cycle', neuronProofFields(neuron));
  if (depth > maxDepth) return result('unknown', 'depth_limit', neuronProofFields(neuron));

  if (ANCHORS.has(neuron.id.toString())) {
    return result(
      YES_ANCHORS.has(neuron.id.toString()) ? 'guaranteed_yes' : 'guaranteed_no',
      null,
      neuronProofFields(neuron),
    );
  }

  const effective = getEffectiveFollowees(neuron, topic);
  if (effective.private) return result('private', null, neuronProofFields(neuron));
  if (effective.followees.length === 0) return result('not_guaranteed', 'no_followees', neuronProofFields(neuron));

  const nextVisited = new Set(visited);
  nextVisited.add(key);
  const children = [];

  for (const followeeId of effective.followees) {
    if (ANCHORS.has(followeeId.toString())) {
      let knownNeuronName = null;
      let hotkeys = [];
      let hotkeysPrivate = true;
      try {
        const followee = await neuronLoader.loadNeuron(followeeId);
        knownNeuronName = followee.knownNeuronName ?? null;
        hotkeys = followee.hotkeys ?? [];
        hotkeysPrivate = followee.hotkeysPrivate ?? !followee.public;
      } catch {
        knownNeuronName = null;
      }
      children.push(result(YES_ANCHORS.has(followeeId.toString()) ? 'guaranteed_yes' : 'guaranteed_no', null, {
        neuronId: followeeId,
        knownNeuronName,
        hotkeys,
        hotkeysPrivate,
      }));
      continue;
    }

    let followee;
    try {
      followee = await neuronLoader.loadNeuron(followeeId);
    } catch {
      children.push(result('unknown', 'query_error', { neuronId: followeeId }));
      continue;
    }

    if (followee.followeesPrivate || followee.public === false) {
      children.push(result('unknown', 'private_followee', {
        neuronId: followeeId,
        knownNeuronName: followee.knownNeuronName ?? null,
      }));
      continue;
    }

    children.push(await prove({
      neuron: followee,
      topic,
      neuronLoader,
      maxDepth,
      depth: depth + 1,
      visited: nextVisited,
    }));
  }

  return mergeChildren(neuron, children);
}
