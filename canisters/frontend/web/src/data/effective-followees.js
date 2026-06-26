import { TOPIC_UNSPECIFIED } from './topics.js';

function unwrapOpt(value) {
  return Array.isArray(value) ? (value.length === 0 ? null : value[0]) : value ?? null;
}

function followeeId(followee) {
  const value = unwrapOpt(followee);
  if (value && typeof value === 'object' && 'id' in value) return BigInt(value.id);
  return BigInt(value);
}

export function getFolloweesForTopic(fullNeuron, topicId) {
  if (!fullNeuron) return null;
  for (const [rawTopicId, followees] of fullNeuron.followees ?? []) {
    if (Number(rawTopicId) === Number(topicId)) {
      return (followees?.followees ?? []).map(followeeId);
    }
  }
  return null;
}

export function getEffectiveFollowees(normalizedNeuron, topic) {
  if (normalizedNeuron.followeesPrivate) {
    return { private: true, followees: [] };
  }

  const explicit = getFolloweesForTopic(normalizedNeuron.fullNeuron, topic.id);
  if (explicit !== null) {
    return { private: false, followees: explicit };
  }

  if (!topic.fallback) {
    return { private: false, followees: [] };
  }

  const catchAll = getFolloweesForTopic(normalizedNeuron.fullNeuron, TOPIC_UNSPECIFIED);
  return { private: false, followees: catchAll ?? [] };
}
