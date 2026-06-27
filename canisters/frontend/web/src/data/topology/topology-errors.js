export const TOPOLOGY_ERROR_CODES = Object.freeze({
  AGENT_INIT_FAILED: 'AGENT_INIT_FAILED',
  ACTOR_INIT_FAILED: 'ACTOR_INIT_FAILED',
  GOVERNANCE_CALL_FAILED: 'GOVERNANCE_CALL_FAILED',
  REGISTRY_CALL_FAILED: 'REGISTRY_CALL_FAILED',
  REGISTRY_RESPONSE_ERR: 'REGISTRY_RESPONSE_ERR',
  PARTIAL_TOPOLOGY: 'PARTIAL_TOPOLOGY',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  RAW_REGISTRY_UNAVAILABLE: 'RAW_REGISTRY_UNAVAILABLE',
});

export class IcTopologyError extends Error {
  constructor(code, message, cause = null) {
    super(message);
    this.name = 'IcTopologyError';
    this.code = code;
    this.cause = cause;
  }
}

export function topologyWarning(code, message, details = null) {
  return details === null ? { code, message } : { code, message, details };
}

export function normalizeTopologyError(code, message, cause = null) {
  if (cause instanceof IcTopologyError) return cause;
  return new IcTopologyError(code, message, cause);
}
