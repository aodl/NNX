import { Actor } from '@icp-sdk/core/agent';
import { idlFactory } from './nns_governance.did.js';

export { idlFactory };

export const canisterId = 'rrkah-fqaaa-aaaaa-aaaaq-cai';

export function createActor(canisterId, options = {}) {
  return Actor.createActor(idlFactory, {
    agent: options.agent,
    canisterId,
  });
}
