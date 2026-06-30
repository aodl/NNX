import { readFileSync } from 'node:fs';

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const packages = lock.packages ?? {};
const problems = [];

for (const [name, pkg] of Object.entries(packages)) {
  if (!pkg || name === '') continue;
  if (pkg.resolved && !pkg.resolved.startsWith('https://registry.npmjs.org/')) {
    problems.push(`${name}: non-registry resolved URL ${pkg.resolved}`);
  }
  if (pkg.link) continue;
  if (!pkg.integrity) {
    problems.push(`${name}: missing integrity`);
  }
}

if (lock.lockfileVersion < 2) {
  problems.push(`unsupported lockfileVersion ${lock.lockfileVersion}`);
}

if (problems.length > 0) {
  console.error('package-lock.json is not hermetic enough:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log('package-lock.json hermeticity check passed.');
