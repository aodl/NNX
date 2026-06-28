import { createHash } from 'node:crypto';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const projectRoot = path.resolve(import.meta.dirname, '../../..');
const entryPoint = path.join(projectRoot, 'canisters/frontend/web/src/main.js');
const publicDir = path.join(projectRoot, 'canisters/frontend/public');
const generatedDir = path.join(publicDir, 'generated');

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
