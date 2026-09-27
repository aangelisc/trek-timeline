#!/usr/bin/env node
// Captures docs/screenshot.png (1600×900, the store card) from the sandbox.
// `trek-plugin-sdk shot` does the same against the SDK dev server, but needs
// Playwright's own Chromium; this falls back to a local Google Chrome. Serves the
// current build, so run it through `npm run shot`, which builds first.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const PORT = 4398;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(HERE, '..', 'docs', 'screenshot.png');

const server = spawn(process.execPath, [path.join(HERE, 'sandbox.ts'), String(PORT), '--no-watch'], {
  stdio: 'ignore',
});
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE + '/__sandbox/events')).ok) break;
    } catch {
      /* starting */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  await page.goto(BASE + '/?shot=1');
  const f = page.frameLocator('#f');
  await f.locator('.ts-timeline').waitFor();
  await f.locator('.ts-toolbar button[title="Narrow days"]').click();
  await f.locator('.ts-toolbar .trek-chip').first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT });
  await browser.close();
  console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  server.kill();
}
