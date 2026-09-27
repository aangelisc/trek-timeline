// The sheet: inline cells, and bars that open their row.
import test from 'node:test';
import assert from 'node:assert/strict';
import { useSandbox, collaboratorEdit, state, open, center, drag, settled } from './helpers.ts';

useSandbox(4401);

test('type a time key by key in the sheet', async () => {
  const { page, f } = await open();
  // Real typing, not fill(): a time input fires `change` on every keystroke.
  await f.locator('[data-key="stay-out:1"]').click();
  await page.keyboard.type('1230', { delay: 40 });
  assert.equal(await f.locator('[data-key="stay-out:1"]').inputValue(), '12:30', 'nothing saved mid-entry');
  assert.equal((await state()).accommodations.find((a) => a.id === 1).check_out, '11:00');
  await page.keyboard.press('Enter');
  await settled(page);
  assert.equal((await state()).accommodations.find((a) => a.id === 1).check_out, '12:30');

  await f.getByRole('tab', { name: 'Transport' }).click();
  await f.locator('[data-key="tr-dep:2"]').click();
  await page.keyboard.type('0945', { delay: 40 });
  await f.locator('.ts-toolbar h1').click(); // focus leaving the cell saves too
  await settled(page);
  const train = (await state()).reservations.find((r) => r.id === 2);
  assert.equal(train.reservation_time, '2026-10-09T09:45');
  assert.equal(train.endpoints.find((e) => e.role === 'from').local_time, '09:45');
  await page.close();
});

test('Escape in a cell abandons the edit', async () => {
  const { page, f } = await open();
  await f.locator('[data-key="stay-conf:1"]').click();
  await page.keyboard.type('XYZ');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  assert.equal(await f.locator('[data-key="stay-conf:1"]').inputValue(), 'GRC-4411');
  assert.equal((await state()).accommodations.find((a) => a.id === 1).confirmation, 'GRC-4411');
  await page.close();
});

test('a live refresh waits while a cell is being edited', async () => {
  const { page, f } = await open();
  await f.locator('[data-key="stay-in:2"]').click();
  await page.keyboard.type('16', { delay: 40 });
  for (let i = 0; i < 3; i++) await collaboratorEdit();
  await page.waitForTimeout(1600);
  assert.equal(await f.getByText('Sam: bring umbrellas').count(), 0, 'held back');
  assert.match(await f.locator('[data-key="stay-in:2"]').inputValue(), /^16:/);
  await page.keyboard.press('Escape');
  await f.getByText('Sam: bring umbrellas').waitFor({ timeout: 5000 });
  await page.close();
});

test('clicking a stay or transport bar opens its row in the sheet', async () => {
  const { page, f } = await open();
  await f.locator('.ts-bar--stay', { hasText: 'Ryokan' }).click();
  const stayRow = f.locator('tr[data-row="stay:2"]');
  await stayRow.and(f.locator('.is-flash')).waitFor();
  assert.equal(await f.getByRole('tab', { name: 'Stays' }).getAttribute('aria-selected'), 'true');
  assert.equal(await stayRow.evaluate((el) => el === document.activeElement), true);

  // A short bar's label beside it works too.
  await f.locator('.ts-barlabel[data-for="1"]').click();
  await f.locator('tr[data-row="transport:1"]').and(f.locator('.is-flash')).waitFor();
  assert.equal(await f.getByRole('tab', { name: 'Transport' }).getAttribute('aria-selected'), 'true');

  // And from the keyboard.
  await f.locator('.ts-bar--stay', { hasText: 'L7' }).focus();
  await page.keyboard.press('Enter');
  await f.locator('tr[data-row="stay:3"]').and(f.locator('.is-flash')).waitFor();
  await page.close();
});

test('finishing a drag does not also open the sheet', async () => {
  const { page, f } = await open();
  await f.getByRole('tab', { name: 'Transport' }).click();
  const b = await center(f.locator('.ts-bar--stay', { hasText: 'Ryokan' }));
  const dayW = (await center(f.locator('.ts-dayhead').first())).box.width;
  await drag(page, b, { x: b.x + dayW, y: b.y });
  assert.equal(await f.getByRole('tab', { name: 'Transport' }).getAttribute('aria-selected'), 'true');
  await page.close();
});
