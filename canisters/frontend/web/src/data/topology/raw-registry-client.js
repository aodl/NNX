import { IcTopologyError, TOPOLOGY_ERROR_CODES } from './topology-errors.js';

export function createRawRegistryClient() {
  throw new IcTopologyError(
    TOPOLOGY_ERROR_CODES.RAW_REGISTRY_UNAVAILABLE,
    'Raw Registry protobuf reads are intentionally not implemented in this Candid-safe topology proxy.',
  );
}
