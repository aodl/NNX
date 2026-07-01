import { createHash } from 'node:crypto';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { createBuildInfo } from './build-info.mjs';
import { resolveFrontendEnv } from './build-frontend-env.mjs';

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

const { env: frontendEnv, warnings: frontendEnvWarnings } = await resolveFrontendEnv({ projectRoot });
for (const warning of frontendEnvWarnings) {
  console.warn(warning);
}

const buildInfo = await createBuildInfo({ projectRoot, frontendEnv });

await writeFile(path.join(generatedDir, bundleFile), bundle);
await writeFile(
  path.join(generatedDir, 'frontend-bundle.json'),
  `${JSON.stringify({ bundlePath }, null, 2)}\n`,
);
await writeFile(
  path.join(generatedDir, 'frontend-env.json'),
  `${JSON.stringify(frontendEnv, null, 2)}\n`,
);
await writeFile(
  path.join(generatedDir, 'build-info.json'),
  `${JSON.stringify(buildInfo, null, 2)}\n`,
);
