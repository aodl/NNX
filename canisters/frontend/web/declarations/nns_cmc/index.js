import { Actor } from '@icp-sdk/core/agent';
import { idlFactory } from './nns_cmc.did.js';

export { idlFactory };

export const canisterId = 'rkp4c-7iaaa-aaaaa-aaaca-cai';

export function createActor(canisterId, options = {}) {
  return Actor.createActor(idlFactory, {
    agent: options.agent,
    canisterId,
  });
}
