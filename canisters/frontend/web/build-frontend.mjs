import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const projectRoot = path.resolve(import.meta.dirname, '../../..');
const entryPoint = path.join(projectRoot, 'canisters/frontend/web/src/main.js');
const publicDir = path.join(projectRoot, 'canisters/frontend/public');
const generatedDir = path.join(publicDir, 'generated');
const indexPath = path.join(publicDir, 'index.html');
const placeholder = '/generated/app.placeholder.js';

await mkdir(generatedDir, { recursive: true });

for (const file of await readdir(generatedDir)) {
  if (/^app\.[a-f0-9]{12}\.js$/.test(file)) {
    await rm(path.join(generatedDir, file));
  }
}

const result = await build({
  entryPoints: [entryPoint],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  write: false,
  sourcemap: false,
});

const bundle = result.outputFiles[0].contents;
const hash = createHash('sha256').update(bundle).digest('hex').slice(0, 12);
const bundleFile = `app.${hash}.js`;
const bundlePath = `generated/${bundleFile}`;

await writeFile(path.join(generatedDir, bundleFile), bundle);
await writeFile(
  path.join(generatedDir, 'frontend-bundle.json'),
  `${JSON.stringify({ bundlePath }, null, 2)}\n`,
);

const index = await readFile(indexPath, 'utf8');
const stamped = index.replace(/\/generated\/app\.[a-f0-9a-z-]+\.js/g, `/${bundlePath}`);
if (!stamped.includes(`/${bundlePath}`)) {
  throw new Error(`Unable to stamp ${indexPath}; missing ${placeholder}`);
}
await writeFile(indexPath, stamped);
