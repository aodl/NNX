#!/usr/bin/env node

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '../..');
const publicDir = path.join(projectRoot, 'canisters/frontend/public');

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.json') || filePath.endsWith('.geojson')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function safePath(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split('?')[0]);
  const relative = cleanPath === '/' ? 'index.html' : cleanPath.replace(/^\/+/, '');
  const filePath = path.resolve(publicDir, relative);
  return filePath.startsWith(publicDir) ? filePath : null;
}

async function stampedIndex() {
  const [indexHtml, manifest] = await Promise.all([
    readFile(path.join(publicDir, 'index.html'), 'utf8'),
    readFile(path.join(publicDir, 'generated/frontend-bundle.json'), 'utf8'),
  ]);
  const { bundlePath } = JSON.parse(manifest);
  return indexHtml.replace('/generated/app.placeholder.js', `/${bundlePath}`);
}

async function respond(response, statusCode, body, type = 'text/plain; charset=utf-8') {
  response.writeHead(statusCode, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
  });
  response.end(body);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const filePath = safePath(url.pathname);
    if (!filePath) {
      await respond(response, 404, 'Not found');
      return;
    }

    try {
      if (filePath.endsWith('index.html')) {
        await respond(response, 200, await stampedIndex(), 'text/html; charset=utf-8');
        return;
      }
      const body = await readFile(filePath);
      await respond(response, 200, body, contentType(filePath));
    } catch (error) {
      if (url.pathname.startsWith('/generated/') || url.pathname.includes('.')) {
        await respond(response, 404, 'Not found');
        return;
      }
      await respond(response, 200, await stampedIndex(), 'text/html; charset=utf-8');
    }
  } catch (error) {
    await respond(response, 500, error?.message ?? String(error));
  }
});

const port = Number(arg('--port', process.env.PORT ?? '4173'));
server.listen(port, '127.0.0.1', () => {
  console.log(`NNX frontend server listening at http://127.0.0.1:${port}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
