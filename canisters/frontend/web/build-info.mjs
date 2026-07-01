import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const HISTORIAN_ENV = 'PUBLIC_CANISTER_ID:nnx_historian';

async function git(args, { projectRoot, execFileImpl = execFileAsync } = {}) {
  try {
    const { stdout } = await execFileImpl('git', args, { cwd: projectRoot });
    return String(stdout ?? '').trim();
  } catch {
    return null;
  }
}

async function repoDirty({ projectRoot, execFileImpl = execFileAsync } = {}) {
  try {
    const { stdout } = await execFileImpl('git', ['status', '--short', '--untracked-files=no'], {
      cwd: projectRoot,
    });
    return String(stdout ?? '').trim().length > 0;
  } catch {
    return null;
  }
}

export async function createBuildInfo({
  projectRoot,
  env = process.env,
  frontendEnv = {},
  now = () => new Date(),
  execFileImpl = execFileAsync,
} = {}) {
  return {
    gitCommit: await git(['rev-parse', 'HEAD'], { projectRoot, execFileImpl }),
    builtAt: now().toISOString(),
    network: env.ICP_NETWORK || env.ICP_ENV || 'unknown',
    environment: env.NNX_DEPLOY_ENVIRONMENT || env.ICP_ENV || 'unknown',
    frontendCanisterId: env.NNX_FRONTEND_CANISTER_ID || null,
    historianCanisterId: env.NNX_HISTORIAN_CANISTER_ID || frontendEnv[HISTORIAN_ENV] || null,
    repoDirty: await repoDirty({ projectRoot, execFileImpl }),
  };
}
