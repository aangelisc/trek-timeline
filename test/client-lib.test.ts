import test from 'node:test';
import assert from 'node:assert/strict';
import * as lib from '../src/client/lib.ts';
import { buildModel } from '../src/server/model/index.ts';
import { computeWarnings } from '../src/server/warnings.ts';
import { tripFixture, dayId } from './fixtures/trip.ts';

const model = () => buildModel(tripFixture());

test('packLanes puts overlapping bars on separate rows', () => {
  const bars = [
    [0, 2],
    [1, 3],
    [2.5, 4],
    [0.5, 0.8],
  ];
  // [0.5, 0.8] ends before [1, 3] starts, so they share row 1.
  assert.deepEqual(
    lib.packLanes(
      bars,
      (b) => b[0],
      (b) => b[1],
    ),
    [0, 1, 0, 1],
  );
  assert.deepEqual(
    lib.packLanes(
      [],
      (b) => b[0],
      (b) => b[1],
    ),
    [],
  );
});

test('the fixture stays pack the overlapping Airbnb onto its own row', () => {
  const m = model();
  const rows = lib.packLanes(
    m.stays,
    (s) => lib.staySpan(s)[0],
    (s) => lib.staySpan(s)[1],
  );
  const byTitle = Object.fromEntries(m.stays.map((s, i) => [s.title, rows[i]]));
  assert.equal(byTitle['Hotel Gracery Shinjuku'], 0);
  assert.equal(byTitle['Shinjuku Airbnb'], 1);
  assert.equal(byTitle['Ryokan Yoshida'], 0); // back-to-back with Gracery: 11:00 out, 15:00 in
});

test('drop geometry', () => {
  assert.equal(lib.insertionIndex([10, 30, 50], 5), 0);
  assert.equal(lib.insertionIndex([10, 30, 50], 31), 2);
  assert.equal(lib.insertionIndex([10, 30, 50], 99), 3);
  assert.equal(lib.dayAt(-20, 100, 5), 0);
  assert.equal(lib.dayAt(250, 100, 5), 2);
  assert.equal(lib.dayAt(9999, 100, 5), 4);
  assert.equal(lib.gapAt(149, 100, 5), 1);
  assert.equal(lib.gapAt(151, 100, 5), 2);
  assert.deepEqual(lib.moveInArray(['a', 'b', 'c', 'd'], 0, 3), ['b', 'c', 'a', 'd']);
  assert.deepEqual(lib.moveInArray(['a', 'b', 'c', 'd'], 3, 1), ['a', 'd', 'b', 'c']);
});

test('fmtDuration', () => {
  assert.equal(lib.fmtDuration(750), '12h 30m');
  assert.equal(lib.fmtDuration(120), '2h');
  assert.equal(lib.fmtDuration(45), '45m');
  assert.equal(lib.fmtDuration(null), '');
});

test('warningIndex keeps the worst level per target', () => {
  const idx = lib.warningIndex(computeWarnings(model()));
  assert.equal(idx.stay[1], 'error');
  assert.equal(idx.stay[3], 'warning');
  assert.equal(idx.day[dayId('2026-10-08')], 'error'); // overlap outranks empty-day
  assert.equal(idx.booking[6], 'warning');
});

test('optimistic reorderDays keeps dates on positions and moves stays with their days', () => {
  const m = model();
  const ids = m.days.map((d) => d.id);
  const next = lib.optimistic.reorderDays(m, lib.moveInArray(ids, 12, 0));
  assert.equal(next.days[0].id, 113);
  assert.equal(next.days[0].date, '2026-10-04');
  assert.equal(next.days[0].number, 1);
  const gracery = next.stays.find((s) => s.id === 1);
  assert.equal(gracery.startIndex, 2);
  assert.equal(m.days[0].id, 101, 'input model untouched');
});

test('optimistic moveItem, moveStay, moveTransport and tray scheduling', () => {
  const m = model();
  const a = lib.optimistic.moveItem(m, 'place', 1, dayId('2026-10-10'), 0);
  assert.equal(a.days[6].items[0].title, 'Senso-ji');
  const b = lib.optimistic.moveStay(m, 2, dayId('2026-10-09'), dayId('2026-10-13'));
  assert.equal(b.stays.find((s) => s.id === 2).nights, 4);
  const c = lib.optimistic.moveTransport(m, 2, dayId('2026-10-10'));
  assert.equal(Math.floor(c.transport.find((t) => t.id === 2).start), 6);
  const d = lib.optimistic.scheduleFromTray(m, 'place', 30, dayId('2026-10-12'));
  assert.ok(d.days[8].items.some((i) => i.title === 'Nara Park' && i.pending));
  assert.ok(!d.unscheduled.places.some((p) => p.id === 30));
  assert.equal(lib.optimistic.moveItem(m, 'place', 999, 101, 0), m, 'unknown item returns the model unchanged');
});

test('time helpers', () => {
  assert.equal(lib.fmtHM(0), '00:00');
  assert.equal(lib.fmtHM(870), '14:30');
  assert.equal(lib.fmtHM(1440 + 15), '00:15');
  assert.equal(lib.fmtHM(-15), '23:45');
  assert.deepEqual(lib.posToDayTime(2 + 990 / 1440), {
    index: 2,
    time: '16:30',
    minutes: 990,
  });
  assert.ok(Math.abs(lib.snapPos(1 + 7 / 1440, 15) - 1) < 1e-9);
});

test('dragStay snaps the dragged edge to 15 minutes and keeps a night', () => {
  const span: lib.Span = [1 + 900 / 1440, 5 + 660 / 1440]; // in day 2 15:00, out day 6 11:00
  const later = lib.dragStay(span, 'start', 97 / 1440, 13, 15); // +1h37 → 16:30 (snapped from 16:37)
  assert.deepEqual(lib.posToDayTime(later[0]), {
    index: 1,
    time: '16:30',
    minutes: 990,
  });
  assert.equal(later[1], span[1]);
  // The check-in can't reach the check-out day.
  assert.equal(lib.posToDayTime(lib.dragStay(span, 'start', 10, 13, 15)[0]).index, 4);
  // The check-out can't come before the day after check-in, or leave the trip.
  assert.equal(lib.posToDayTime(lib.dragStay(span, 'end', -10, 13, 15)[1]).index, 2);
  assert.equal(lib.posToDayTime(lib.dragStay(span, 'end', 40, 13, 15)[1]).index, 12);
  // Moving the bar keeps its length.
  const moved = lib.dragStay(span, null, 1 + 30 / 1440, 13, 15);
  assert.deepEqual([lib.posToDayTime(moved[0]).time, lib.posToDayTime(moved[1]).time], ['15:30', '11:30']);
});

test('dragStay without snapping moves whole days and keeps the times', () => {
  const span: lib.Span = [1 + 900 / 1440, 5 + 660 / 1440];
  const m = lib.dragStay(span, null, 1.4, 13, null);
  assert.deepEqual(
    [lib.posToDayTime(m[0]), lib.posToDayTime(m[1])].map((x) => `${x.index} ${x.time}`),
    ['2 15:00', '6 11:00'],
  );
  assert.equal(lib.posToDayTime(lib.dragStay(span, null, 99, 13, null)[1]).index, 12);
});

test('dragTransport returns snapped minutes and stays inside the trip', () => {
  const start = 5 + 600 / 1440; // day 6 10:00
  assert.equal(lib.dragTransport(start, 100 / 1440, 13, 15), 105); // 11:40 → 11:45
  assert.equal(lib.dragTransport(start, 1.3, 13, null), 1440);
  assert.equal(lib.dragTransport(start, -99, 13, 15), -Math.round(start * 1440));
});

test('optimistic shiftTransport and timed moveStay', () => {
  const m = model();
  const t = lib.optimistic.shiftTransport(m, 2, 90).transport.find((x) => x.id === 2);
  assert.equal(t.dep.time, '11:30');
  assert.equal(t.arr.time, '13:45');
  const late = lib.optimistic.shiftTransport(m, 3, 5 * 60).transport.find((x) => x.id === 3);
  assert.equal(late.dayId, dayId('2026-10-14')); // 19:30 + 5h crosses midnight
  const s = lib.optimistic
    .moveStay(m, 1, dayId('2026-10-05'), dayId('2026-10-09'), {
      checkIn: '17:00',
    })
    .stays.find((x) => x.id === 1);
  assert.equal(s.checkIn, '17:00');
  assert.equal(s.checkOut, '11:00');
});
