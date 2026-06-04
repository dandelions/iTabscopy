#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const rawVersion = process.argv[2] || process.env.GITHUB_REF_NAME || process.env.VITE_APP_VERSION || '';
const version = rawVersion
  .replace(/^refs\/tags\//, '')
  .replace(/^v/i, '')
  .trim();

if (!/^\d+\.\d+\.\d+(\.\d+)?$/.test(version)) {
  throw new Error(`Invalid extension version: ${rawVersion || '(empty)'}`);
}

const writeJson = (path, update, spaces = 2) => {
  const absolutePath = resolve(path);
  const data = JSON.parse(readFileSync(absolutePath, 'utf8'));
  writeFileSync(absolutePath, `${JSON.stringify(update(data), null, spaces)}\n`);
};

writeJson('package.json', (pkg) => ({ ...pkg, version }));
writeJson('public/manifest.json', (manifest) => ({ ...manifest, version }), 4);

console.log(`Extension version set to ${version}`);
