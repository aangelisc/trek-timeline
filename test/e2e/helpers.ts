// Shared by the browser tests: a sandbox per test file, a browser, and helpers that
// drive the page the way a person would (real mouse moves, key-by-key typing).
// The tests serve the current build, so run them through `npm run test:e2e`, which builds first.

import test from 'node:test';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import type { Browser, FrameLocator, Locator, Page } from 'playwright';
import type { RawTrek } from '../../src/server/trek.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let BASE = '';
let server: ChildProcess;
let browser: Browser;

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: 'chrome' });
  }
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE + '/__sandbox/events')).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('sandbox did not start');
}

/**
 * Start a sandbox and a browser for this test file, stopped when it ends. Each file
 * takes its own port, so a sandbox still shutting down never answers the next file.
 */
export function useSandbox(port: number): void {
  test.before(async () => {
    BASE = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, [path.join(HERE, '../../scripts/sandbox.ts'), String(port), '--no-watch'], {
      stdio: 'ignore',
    });
    await waitForServer();
    browser = await launch();
  });
  test.after(async () => {
    if (browser) await browser.close();
    if (server) server.kill();
  });
}

export const sandbox = (body: { upstream?: boolean; readOnly?: boolean; reset?: boolean }) =>
  fetch(BASE + '/__sandbox/config', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json());
/** An edit by someone else, which the page should pick up through trek.onEvent. */
export const collaboratorEdit = () => fetch(BASE + '/__sandbox/collab', { method: 'POST' });
/** The sandbox TREK's data, as a real TREK would now return it. */
export const state = (): Promise<RawTrek> => fetch(BASE + '/__sandbox/state').then((r) => r.json());

/** A fresh page on fresh data. `dialog` answers trek.confirm (default: accept). */
export async function open({ upstream = true, readOnly = false, dialog = true } = {}) {
  await sandbox({ upstream, readOnly, reset: true });
  const page = await browser.newPage({
    viewport: { width: 2000, height: 1100 },
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const dialogs: string[] = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    return dialog ? d.accept() : d.dismiss();
  });
  await page.goto(BASE + '/');
  const f = page.frameLocator('#f');
  await f.locator('.ts-timeline').waitFor();
  // Narrow days so the whole trip fits: drags need both ends on screen.
  await f.locator('.ts-toolbar button[title="Narrow days"]').click();
  return { page, f, errors, dialogs };
}

export type Point = { x: number; y: number };

export async function center(locator: Locator) {
  const b = await locator.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b };
}

export async function drag(page: Page, from: Point, to: Point, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 2, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
  await settled(page);
}

/** Wait until no edit is in flight (the page marks #app with data-busy). */
export async function settled(page: Page) {
  await page.waitForTimeout(50);
  await page.frameLocator('#f').locator('#app:not([data-busy])').waitFor();
}

export const dayCol = (f: FrameLocator, id: number) => f.locator(`.ts-daycol[data-id="${id}"]`);
export const card = (f: FrameLocator, title: string) => f.locator('.ts-daycol .ts-card', { hasText: title });
