import { NNS_TOPICS, TOPIC_UNSPECIFIED } from './topics.generated.js';

export { NNS_TOPICS, TOPIC_UNSPECIFIED };

export function getDisplayTopics() {
  return NNS_TOPICS.filter((topic) => topic.id !== TOPIC_UNSPECIFIED);
}

export function getTopicByKey(key) {
  return NNS_TOPICS.find((topic) => topic.key === key) ?? null;
}
