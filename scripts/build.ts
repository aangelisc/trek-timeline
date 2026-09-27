#!/usr/bin/env node
// Builds the plugin TREK loads from src/:
//   server/index.js   one CommonJS file. TREK's child process require()s it and injects
//                     'trek-plugin-sdk' itself, so the SDK stays external.
//   client/           index.html, styles.css and app.js (one classic script: the frame
//                     sits at an opaque origin, where ES modules don't load).
//
//   node scripts/build.ts            build once
//   node scripts/build.ts --watch    rebuild on change (the sandbox uses watch())

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (...p: string[]) => path.join(ROOT, ...p);
const STATIC = ['index.html', 'styles.css'];

/**
 * TREK takes the module type from the package.json the plugin ships, and the root one
 * says "module" (for the .ts sources). This one, nearer to the bundle, keeps it CommonJS.
 */
function writeServerPackage(): void {
  fs.writeFileSync(at('server', 'package.json'), '{ "type": "commonjs" }\n');
}

function copyStatic(): void {
  for (const f of STATIC) fs.copyFileSync(at('src', 'client', f), at('client', f));
}

const server: esbuild.BuildOptions = {
  entryPoints: [at('src', 'server', 'index.ts')],
  outfile: at('server', 'index.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['trek-plugin-sdk'],
  // The entry's default export IS the plugin definition, the plain shape TREK loads.
  footer: { js: 'module.exports = module.exports.default;' },
  logLevel: 'warning',
};

const client: esbuild.BuildOptions = {
  entryPoints: [at('src', 'client', 'app.ts')],
  outfile: at('client', 'app.js'),
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  logLevel: 'warning',
};

function clean(): void {
  for (const dir of ['server', 'client']) {
    fs.rmSync(at(dir), { recursive: true, force: true });
    fs.mkdirSync(at(dir));
  }
}

export async function build(): Promise<void> {
  clean();
  await Promise.all([esbuild.build(server), esbuild.build(client)]);
  writeServerPackage();
  copyStatic();
}

/** Build, then keep rebuilding on change. Resolves once the first build is done. */
export async function watch(): Promise<() => Promise<void>> {
  clean();
  writeServerPackage();
  copyStatic();
  const copyOnChange = fs.watch(at('src', 'client'), (_e, f) => {
    if (f && STATIC.includes(f)) copyStatic();
  });
  const ctxs = await Promise.all([esbuild.context(server), esbuild.context(client)]);
  await Promise.all(ctxs.map((c) => c.rebuild()));
  await Promise.all(ctxs.map((c) => c.watch()));
  return async () => {
    copyOnChange.close();
    await Promise.all(ctxs.map((c) => c.dispose()));
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--watch')) {
    await watch();
    console.log('watching src/ …');
  } else {
    await build();
    console.log('built server/ and client/');
  }
}
