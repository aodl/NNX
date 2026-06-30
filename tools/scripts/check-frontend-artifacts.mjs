import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const index = readFileSync('canisters/frontend/public/index.html', 'utf8');
if (!index.includes('/generated/app.placeholder.js')) {
  fail('canisters/frontend/public/index.html must reference /generated/app.placeholder.js.');
}

const tracked = git(['ls-files', 'canisters/frontend/public/generated']);
for (const file of tracked.split('\n').filter(Boolean)) {
  if (file !== 'canisters/frontend/public/generated/.gitkeep') {
    fail(`generated frontend artifact is tracked: ${file}`);
  }
}

const staged = git(['diff', '--cached', '--name-only', '--', 'canisters/frontend/public/generated']);
for (const file of staged.split('\n').filter(Boolean)) {
  if (file !== 'canisters/frontend/public/generated/.gitkeep') {
    fail(`generated frontend artifact is staged: ${file}`);
  }
}

const ignored = git(['check-ignore', 'canisters/frontend/public/generated/app.test.js']).trim();
if (ignored !== 'canisters/frontend/public/generated/app.test.js') {
  fail('canisters/frontend/public/generated/app.<hash>.js files must remain ignored.');
}

const gitkeepIgnored = (() => {
  try {
    git(['check-ignore', 'canisters/frontend/public/generated/.gitkeep']);
    return true;
  } catch {
    return false;
  }
})();
if (gitkeepIgnored) {
  fail('canisters/frontend/public/generated/.gitkeep must not be ignored.');
}

const mapAttribution = readFileSync('canisters/frontend/public/map/README.md', 'utf8');
if (!/Natural Earth/i.test(mapAttribution)) {
  fail('Natural Earth attribution must remain present in the checked-in map data.');
}

if (process.exitCode) process.exit(process.exitCode);
console.log('frontend artifact check passed.');
