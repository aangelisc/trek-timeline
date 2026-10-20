// The page as a whole: loading, live updates, and the gated, read-only and mobile modes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { useSandbox, collaboratorEdit, state, dayCol, card, open, center, drag, setFrameHeight } from './helpers.ts';

useSandbox(4402);

test('in a short fill frame the page scrolls instead of clipping its sheet', async () => {
  const { page, f } = await open();
  // Shrink the fill frame below the content, like a small screen.
  await setFrameHeight(page, 400);
  await page.waitForTimeout(50);
  const m = await f.locator('#app').evaluate((app) => {
    app.scrollTop = app.scrollHeight;
    const sheet = document.querySelector('.ts-sheet').getBoundingClientRect();
    return {
      scrollable: app.scrollHeight - app.clientHeight,
      sheetReachable: sheet.bottom <= window.innerHeight + 2,
    };
  });
  assert.ok(m.scrollable > 0, 'the app scrolls when content exceeds the frame');
  assert.ok(m.sheetReachable, 'scrolling brings the sheet fully into view');
  await page.close();
});

test('loads the fixture trip with its warnings', async () => {
  const { page, f, errors } = await open();
  assert.equal(await f.locator('.ts-dayhead').count(), 13);
  const chips = await f.locator('.ts-toolbar .trek-chip').allTextContents();
  assert.deepEqual(chips, ['1 clash', '4 warnings', '1 hint']);
  await f.getByText('1 clash').click();
  await f
    .locator('.ts-warnings')
    .getByText(/overlap for 1 night/)
    .waitFor();
  assert.equal(await f.locator('.ts-bar--stay').count(), 4);
  assert.equal(await f.locator('.ts-bar--transport').count(), 4);
  // A short bar carries its route in a label beside it.
  assert.match(await f.locator('.ts-bar--transport').first().getAttribute('aria-label'), /LHR → HND, 11:30–08:00/);
  assert.match(await f.locator('.ts-barlabel').first().textContent(), /LHR → HND/);
  assert.deepEqual(errors, []);
  await page.close();
});

test('a collaborator edit shows up without a reload', async () => {
  const { page, f } = await open();
  for (let i = 0; i < 3; i++) await collaboratorEdit();
  await f.getByText('Sam: bring umbrellas').waitFor({ timeout: 5000 });
  await page.close();
});

test('without the upstream API, gated gestures are off and explained', async () => {
  const { page, f } = await open({ upstream: false, fillHeight: 1000 });
  await f.getByText('Some moves need a newer TREK.').waitFor();
  assert.equal(await f.locator('.ts-dayhead[data-drag]').count(), 0);
  assert.equal(await f.locator('.ts-daycol .ts-card--place[data-drag]').count(), 0);
  assert.equal(await f.locator('.ts-tray .ts-card--place[data-drag]').count(), 2, 'planning from the tray works today');
  assert.ok((await f.locator('.ts-bar--stay[data-drag]').count()) > 0, 'stays still move');
  // A note can't leave its day: dropping it elsewhere is refused on the spot.
  const from = await center(card(f, 'Kimono rental'));
  const target = await center(dayCol(f, 108));
  await drag(page, from, target);
  await page.waitForTimeout(300);
  assert.equal(await dayCol(f, 107).locator('.ts-card', { hasText: 'Kimono rental' }).count(), 1);
  await page.close();
});

test('a read-only member gets reverted and told once', async () => {
  const { page, f } = await open({ readOnly: true, fillHeight: 1000 });
  const bar = await center(f.locator('.ts-bar--stay', { hasText: 'L7' }));
  const dayW = (await center(f.locator('.ts-dayhead').first())).box.width;
  await drag(page, bar, { x: bar.x - dayW, y: bar.y });
  await f.getByText('View only.').waitFor();
  assert.equal(await f.locator('[data-drag]').count(), 0);
  assert.equal((await state()).accommodations.find((a) => a.id === 3).start_day_id, 110);
  await page.close();
});

test('mobile layout lists days and moves with a picker', async () => {
  const { page, f } = await open();
  await page.locator('#sbx-mob').check();
  await f.locator('.ts-agenda').waitFor();
  assert.equal(await f.locator('.ts-aday[data-day]').count(), 13);
  assert.equal(await f.locator('.ts-timeline').count(), 0);
  await page.close();
});
