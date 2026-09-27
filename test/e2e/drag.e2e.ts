// Moving things on the timeline, by mouse and by keyboard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { useSandbox, state, dayCol, card, open, center, drag, settled } from './helpers.ts';

useSandbox(4399);

test('drag a place to another day', async () => {
  const { page, f, errors } = await open();
  const from = await center(card(f, 'Senso-ji'));
  const target = await center(dayCol(f, 107));
  await drag(page, from, { x: target.x, y: target.box.y + 6 });
  await dayCol(f, 107).locator('.ts-card', { hasText: 'Senso-ji' }).waitFor();
  const s = await state();
  const d7 = s.days.find((d) => d.id === 107);
  assert.equal(d7.assignments[0].place.name, 'Senso-ji');
  assert.ok(!s.days.find((d) => d.id === 102).assignments.some((a) => a.place.name === 'Senso-ji'));
  assert.deepEqual(errors, []);
  await page.close();
});

test('Escape cancels a drag without writing', async () => {
  const { page, f } = await open();
  const from = await center(card(f, 'Meiji Shrine'));
  const target = await center(dayCol(f, 108));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.waitForTimeout(300);
  assert.equal(await dayCol(f, 103).locator('.ts-card', { hasText: 'Meiji Shrine' }).count(), 1);
  const s = await state();
  assert.ok(s.days.find((d) => d.id === 103).assignments.some((a) => a.place.name === 'Meiji Shrine'));
  await page.close();
});

test('stretch a stay by its check-out edge, confirming the preview', async () => {
  const { page, f, dialogs } = await open();
  const bar = f.locator('.ts-bar--stay', { hasText: 'Ryokan' });
  const handle = bar.locator('[data-handle="end"]');
  const h = await center(handle);
  const dayW = (await center(f.locator('.ts-dayhead').first())).box.width;
  await drag(page, h, { x: h.x + dayW, y: h.y });
  await f.locator('.ts-bar--stay', { hasText: 'Ryokan' }).filter({ hasText: '4 nights' }).waitFor();
  assert.equal(dialogs.length, 1);
  assert.match(dialogs[0], /Change this stay\?/);
  assert.match(dialogs[0], /Was 3 nights/);
  assert.equal((await state()).accommodations.find((a) => a.id === 2).end_day_id, 110);
  await page.close();
});

test('cancelling the preview puts the stay back', async () => {
  const { page, f, dialogs } = await open({ dialog: false });
  const bar = f.locator('.ts-bar--stay', { hasText: 'Ryokan' });
  const b = await center(bar);
  const dayW = (await center(f.locator('.ts-dayhead').first())).box.width;
  await drag(page, b, { x: b.x + dayW, y: b.y });
  await page.waitForTimeout(400);
  assert.equal(dialogs.length, 1);
  assert.match(await f.locator('.ts-bar--stay', { hasText: 'Ryokan' }).textContent(), /3 nights/);
  assert.equal((await state()).accommodations.find((a) => a.id === 2).start_day_id, 106);
  await page.close();
});

test('plan an unscheduled place from the tray', async () => {
  const { page, f } = await open();
  const from = await center(f.locator('.ts-tray .ts-card', { hasText: 'Nara Park' }));
  const target = await center(dayCol(f, 109));
  await drag(page, from, target, 20);
  await dayCol(f, 109).locator('.ts-card', { hasText: 'Nara Park' }).waitFor();
  assert.equal(await f.locator('.ts-tray .ts-card', { hasText: 'Nara Park' }).count(), 0);
  assert.match(await f.locator('.ts-toolbar').textContent(), /Unscheduled \(3\)/);
  await page.close();
});

test('drag a day header to reorder days', async () => {
  const { page, f, dialogs } = await open();
  // Move Day 8 (Oct 11, Kinkaku-ji) before Day 7.
  const from = await center(f.locator('.ts-dayhead[data-id="108"]'));
  const to = await center(f.locator('.ts-dayhead[data-id="107"]'));
  await drag(page, from, { x: to.box.x + 4, y: to.y });
  await f.locator('.ts-dayhead').nth(6).and(f.locator('[data-id="108"]')).waitFor();
  assert.equal(dialogs.length, 0, 'no bookings or stays change, so no confirmation');
  const s = await state();
  const moved = s.days.find((d) => d.id === 108);
  assert.equal(moved.day_number, 7);
  assert.equal(moved.date, '2026-10-10');
  await page.close();
});

test('keyboard move: M, arrows, Enter', async () => {
  const { page, f } = await open();
  await f.locator('.ts-card', { hasText: 'Kimono rental' }).focus();
  await page.keyboard.press('m');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await settled(page);
  await f.locator('.ts-daycol[data-id="107"] .ts-card').first().filter({ hasText: 'Kimono rental' }).waitFor();
  const note = (await state()).days.find((d) => d.id === 107).notes_items[0];
  assert.ok(note.sort_order < 0, 'sorted before Fushimi Inari (order 0)');
  await page.close();
});

test("drag a stay's check-in edge to a later time on the same day", async () => {
  const { page, f, dialogs } = await open();
  const dayW = (await center(f.locator('.ts-dayhead').first())).box.width;
  const edge = await center(f.locator('.ts-bar--stay', { hasText: 'Gracery' }).locator('[data-handle="start"]'));
  await drag(page, edge, { x: edge.x + ((2 * 60) / 1440) * dayW, y: edge.y }, 6);
  assert.equal(dialogs.length, 0, 'same days: nothing to confirm');
  const stay = (await state()).accommodations.find((a) => a.id === 1);
  assert.equal(stay.check_in, '17:00');
  assert.equal(stay.check_in_end, '23:59', 'the window keeps its length, capped at midnight');
  assert.equal(stay.start_day_id, 102);
  assert.equal(stay.check_out, '11:00');
  await page.close();
});

test('Shift-drag moves a stay by whole days and keeps its times', async () => {
  const { page, f } = await open();
  const dayW = (await center(f.locator('.ts-dayhead').first())).box.width;
  const b = await center(f.locator('.ts-bar--stay', { hasText: 'Ryokan' }));
  await page.keyboard.down('Shift');
  await drag(page, b, { x: b.x + dayW * 1.3, y: b.y });
  await page.keyboard.up('Shift');
  const stay = (await state()).accommodations.find((a) => a.id === 2);
  assert.deepEqual([stay.start_day_id, stay.end_day_id, stay.check_in, stay.check_out], [107, 110, '15:00', '10:00']);
  await page.close();
});
