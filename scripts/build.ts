#!/usr/bin/env node
// Builds the plugin TREK loads from src/:
//   server/index.js   one CommonJS file. TREK's child process require()s it and injects
//                     'trek-plugin-sdk' itself, so the SDK stays external.
//   client/index.html  page with its CSS and classic script inlined for the opaque frame.
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

function writeClientPage(): void {
  const html = fs.readFileSync(at('src', 'client', 'index.html'), 'utf8');
  const css = fs.readFileSync(at('src', 'client', 'styles.css'), 'utf8');
  const js = fs.readFileSync(at('client', 'app.js'), 'utf8');
  const styleTag = '<link rel="stylesheet" href="./styles.css" />';
  const scriptTag = '<script src="./app.js"></script>';
  if (!html.includes(styleTag) || !html.includes(scriptTag)) {
    throw new Error('Client asset tags not found in index.html');
  }
  if (/<\/style/i.test(css) || /<\/script/i.test(js)) {
    throw new Error('Client assets contain an HTML closing tag');
  }
  fs.writeFileSync(
    at('client', 'index.html'),
    html.replace(styleTag, () => `<style>\n${css}\n</style>`).replace(scriptTag, () => `<script>\n${js}\n</script>`),
  );
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
  writeClientPage();
}

/** Build, then keep rebuilding on change. Resolves once the first build is done. */
export async function watch(): Promise<() => Promise<void>> {
  clean();
  writeServerPackage();
  const copyOnChange = fs.watch(at('src', 'client'), (_e, f) => {
    if (f && STATIC.includes(f) && fs.existsSync(at('client', 'app.js'))) writeClientPage();
  });
  const ctxs = await Promise.all([
    esbuild.context(server),
    esbuild.context({
      ...client,
      plugins: [
        {
          name: 'inline-page',
          setup: (b) => {
            b.onEnd((result) => {
              if (!result.errors.length) writeClientPage();
            });
          },
        },
      ],
    }),
  ]);
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
