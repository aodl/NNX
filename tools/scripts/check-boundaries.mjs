import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC_ROOT = 'canisters/frontend/web/src';
const TEST_ROOT = 'canisters/frontend/web/test';

const ALLOWED_PATH_PATTERNS = [
  /\/data\/query\//,
  /\/data\/topology\//,
  /\/data\/node-health-metrics\/historian-client\.js$/,
  /\/data\/topics\.js$/,
  /\/app\/config\.js$/,
  /\/main\.js$/,
];

const FORBIDDEN_IMPORT_PATTERNS = [
  { pattern: /\/declarations\//, reason: 'generated Candid declarations' },
  { pattern: /@icp-sdk\/core\/agent/, reason: 'agent internals' },
  { pattern: /@icp-sdk\/core\/principal/, reason: 'Principal internals' },
  { pattern: /raw-registry-client/, reason: 'raw Registry client' },
  { pattern: /protobuf|proto-decode|decode.*registry/i, reason: 'protobuf/raw decode internals' },
  { pattern: /historian.*did|historian-client/, reason: 'historian Candid/client boundary' },
];

function walk(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) entries.push(...walk(full));
    else if (full.endsWith('.js')) entries.push(full);
  }
  return entries;
}

function isAllowed(file) {
  const normalized = `/${file.replaceAll(path.sep, '/')}`;
  return ALLOWED_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

function imports(source) {
  const result = [];
  const importRe = /import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(importRe)) result.push(match[1]);
  const dynamicRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of source.matchAll(dynamicRe)) result.push(match[1]);
  return result;
}

const problems = [];
for (const file of walk(SRC_ROOT)) {
  if (isAllowed(file)) continue;
  const source = readFileSync(file, 'utf8');
  for (const specifier of imports(source)) {
    for (const forbidden of FORBIDDEN_IMPORT_PATTERNS) {
      if (forbidden.pattern.test(specifier)) {
        problems.push(`${file}: forbidden import "${specifier}" (${forbidden.reason})`);
      }
    }
  }
  if (/\bUint8Array\b/.test(source) && /protobuf|registry|candid|principal/i.test(source)) {
    problems.push(`${file}: direct Uint8Array/protobuf-style system parsing belongs in boundary modules`);
  }
}

for (const file of walk(TEST_ROOT)) {
  if (!/boundary-fixtures\/bad/.test(file)) continue;
  const source = readFileSync(file, 'utf8');
  if (!imports(source).some((specifier) => /\/declarations\/|@icp-sdk\/core\/principal/.test(specifier))) {
    problems.push(`${file}: negative boundary fixture no longer exercises a forbidden import`);
  }
}

if (problems.length > 0) {
  console.error('Boundary check failed:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log('boundary check passed.');
