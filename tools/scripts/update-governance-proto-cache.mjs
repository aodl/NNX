import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const protoUrl =
  process.env.NNX_GOVERNANCE_PROTO_URL ||
  'https://raw.githubusercontent.com/dfinity/ic/master/rs/nns/governance/proto/ic_nns_governance/pb/v1/governance.proto';
const cachePath = path.resolve('tools/cache/governance.proto');

function normalizeProto(contents) {
  return `${contents.replace(/\r\n?/g, '\n').trimEnd()}\n`;
}

async function fetchProto(fetchImpl = fetch) {
  const response = await fetchImpl(protoUrl);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const proto = normalizeProto(await response.text());
  if (!/\benum\s+Topic\s*\{/.test(proto)) {
    throw new Error('fetched governance.proto does not contain enum Topic');
  }

  return proto;
}

export async function updateGovernanceProtoCache({ fetchImpl = fetch } = {}) {
  const proto = await fetchProto(fetchImpl);
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, proto, 'utf8');
  return { cachePath, bytes: Buffer.byteLength(proto, 'utf8') };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = await updateGovernanceProtoCache();
    console.log(`Updated ${path.relative(process.cwd(), result.cachePath)} (${result.bytes} bytes)`);
  } catch (error) {
    console.error(`update-governance-proto-cache failed: ${error.message}`);
    process.exitCode = 1;
  }
}
