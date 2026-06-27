import { Actor } from '@icp-sdk/core/agent';
import { idlFactory } from './nns_registry.did.js';

export { idlFactory };

export const canisterId = 'rwlgt-iiaaa-aaaaa-aaaaa-cai';

export function createActor(canisterId, options = {}) {
  return Actor.createActor(idlFactory, {
    agent: options.agent,
    canisterId,
  });
}
