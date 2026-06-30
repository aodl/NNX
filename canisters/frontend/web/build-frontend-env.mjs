import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const NODE_METRICS_PROXY_ENV = 'PUBLIC_CANISTER_ID:nnx_node_metrics_proxy';
export const NODE_METRICS_PROXY_ALIAS_ENV = 'NNX_NODE_METRICS_PROXY_CANISTER_ID';

async function readJsonIfExists(projectRoot, file, warnings) {
  try {
    return JSON.parse(await readFile(path.join(projectRoot, file), 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      warnings.push(`Ignoring malformed canister mapping ${file}: ${error.message}`);
    }
    return null;
  }
}

function explicitCanisterId(env) {
  return env[NODE_METRICS_PROXY_ENV] || env[NODE_METRICS_PROXY_ALIAS_ENV] || null;
}

function explicitNetwork(env) {
  const network = env.ICP_NETWORK || env.ICP_ENV || null;
  return network === 'local' || network === 'ic' ? network : null;
}

async function mappingCanisterIdForNetwork({ projectRoot, network, warnings }) {
  const mappingFiles = network === 'local'
    ? ['.icp/cache/mappings/local.ids.json', '.icp/data/mappings/local.ids.json']
    : ['.icp/data/mappings/ic.ids.json'];

  for (const file of mappingFiles) {
    const mapping = await readJsonIfExists(projectRoot, file, warnings);
    if (typeof mapping?.nnx_node_metrics_proxy === 'string' && mapping.nnx_node_metrics_proxy) {
      return mapping.nnx_node_metrics_proxy;
    }
  }
  return null;
}

export async function resolveFrontendEnv({
  projectRoot,
  env = process.env,
} = {}) {
  const warnings = [];
  const canisterId = explicitCanisterId(env)
    ?? (explicitNetwork(env)
      ? await mappingCanisterIdForNetwork({ projectRoot, network: explicitNetwork(env), warnings })
      : null);

  return {
    env: {
      [NODE_METRICS_PROXY_ENV]: canisterId,
    },
    warnings,
  };
}
