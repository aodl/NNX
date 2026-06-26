import { GUARANTEE_ANCHOR_NEURONS, MAX_GUARANTEE_DEPTH } from '../app/config.js';
import { getEffectiveFollowees } from './effective-followees.js';

const ANCHORS = new Set(Object.values(GUARANTEE_ANCHOR_NEURONS).map((id) => id.toString()));

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
  const unknown = children.find((child) => child.status === 'unknown');
  if (unknown) return result('unknown', unknown.reason, { ...parent, children, depthLimitReached: unknown.depthLimitReached });
  const privateChild = children.find((child) => child.status === 'private');
  if (privateChild) return result('unknown', 'private_followee', { ...parent, children });
  const blocker = children.find((child) => child.status !== 'guaranteed');
  if (blocker) {
    return result('not_guaranteed', 'blocking_followee', {
      ...parent,
      children,
      blockingFolloweeId: blocker.neuronId ?? blocker.blockingFolloweeId,
    });
  }
  return result('guaranteed', null, { ...parent, children });
}

export async function getGuaranteeStatus({ neuron, topic, neuronLoader, maxDepth = MAX_GUARANTEE_DEPTH }) {
  return prove({ neuron, topic, neuronLoader, maxDepth, depth: 0, visited: new Set() });
}

async function prove({ neuron, topic, neuronLoader, maxDepth, depth, visited }) {
  if (!neuron.exists) return result('not_guaranteed', 'blocking_followee', neuronProofFields(neuron));
  if (neuron.followeesPrivate) return result('private');

  const key = `${neuron.id.toString()}:${topic.id}`;
  if (visited.has(key)) return result('not_guaranteed', 'cycle', neuronProofFields(neuron));
  if (depth > maxDepth) return result('unknown', 'depth_limit', neuronProofFields(neuron));

  if (ANCHORS.has(neuron.id.toString())) {
    return result('guaranteed', null, neuronProofFields(neuron));
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
      children.push(result('guaranteed', null, {
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
