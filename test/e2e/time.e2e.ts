// Timed drags land on the zoom's time grid; keyboard nudges move by 15 minutes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { useSandbox, state, open, center, drag, settled } from './helpers.ts';

useSandbox(4400);

test('drag a train later by two hours; the tooltip shows where it lands', async () => {
  const { page, f, dialogs } = await open();
  const dayW = (await center(f.locator('.ts-dayhead').first())).box.width; // narrow zoom: snaps to the hour
  const bar = await center(f.locator('.ts-bar--transport[data-id="2"]'));
  const dx = ((2 * 60) / 1440) * dayW;
  await page.mouse.move(bar.x, bar.y);
  await page.mouse.down();
  await page.mouse.move(bar.x + 3, bar.y, { steps: 2 });
  await page.mouse.move(bar.x + dx, bar.y, { steps: 6 });
  assert.match(
    await page.frameLocator('#f').locator('.ts-dragtip').textContent(),
    /Departs .*Oct 9 12:00 {2}→ {2}arrives 14:15/,
  );
  await page.mouse.up();
  await settled(page);
  assert.equal(dialogs.length, 1, 'a real booking asks first');
  const train = (await state()).reservations.find((r) => r.id === 2);
  assert.equal(train.reservation_time, '2026-10-09T12:00');
  assert.deepEqual(
    train.endpoints.map((e) => e.local_time),
    ['12:00', '14:15'],
  );
  assert.equal(await f.locator('.ts-dragtip').count(), 0, 'tooltip cleaned up');
  await page.close();
});

test('keyboard nudges: , and . move by 15 minutes', async () => {
  const { page, f } = await open();
  await f.locator('.ts-bar--transport[data-id="2"]').focus();
  await page.keyboard.press('m');
  await page.keyboard.press('Period');
  await page.keyboard.press('Period');
  await page.keyboard.press('Period');
  await page.keyboard.press('Comma');
  assert.match(await f.locator('.ts-dragtip').textContent(), /10:30/);
  await page.keyboard.press('Enter');
  await settled(page);
  assert.equal((await state()).reservations.find((r) => r.id === 2).reservation_time, '2026-10-09T10:30');
  await page.close();
});

test('a transport dragged past midnight lands on the next day', async () => {
  const { page, f } = await open();
  const dayW = (await center(f.locator('.ts-dayhead').first())).box.width;
  // KE724 departs Oct 13 19:30; ~6h later lands on the hour grid, around 01:00–02:00 on Oct 14.
  const bar = await center(f.locator('.ts-bar--transport[data-id="3"]'));
  await drag(page, bar, { x: bar.x + ((6 * 60) / 1440) * dayW, y: bar.y }, 8);
  const r = (await state()).reservations.find((x) => x.id === 3);
  assert.equal(r.day_id, 111);
  assert.match(r.reservation_time, /^2026-10-14T0[12]:00$/);
  assert.deepEqual(
    r.endpoints.map((e) => e.local_date),
    ['2026-10-14', '2026-10-14'],
  );
  await page.close();
});
