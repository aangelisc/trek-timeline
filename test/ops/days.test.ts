import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, dayIds } from '../support/ops.ts';
import { TRIP_ID } from '../fixtures/trip.ts';
import type { OpError } from '../../src/server/operations/index.ts';

test('reorderDays: swapping two days previews re-dated bookings and stay changes', async () => {
  const s = await setup({ upstream: true });
  const ids = dayIds();
  [ids[2], ids[3]] = [ids[3], ids[2]]; // swap Oct 6 and Oct 7
  const p = await s.plan('reorderDays', { orderedIds: ids });
  assert.equal(p.destructive, true);
  const text = p.summary.join('\n');
  assert.match(text, /Sushi Saito → 2026-10-07/);
  assert.match(text, /teamLab Planets → 2026-10-06/);
  assert.deepEqual(p.calls, [{ method: 'days.reorder', args: [TRIP_ID, ids] }]);
});

test('reorderDays: applied, dates stay on positions and bookings follow their day', async () => {
  const s = await setup({ upstream: true });
  const ids = dayIds();
  [ids[2], ids[3]] = [ids[3], ids[2]];
  const m = await s.run('reorderDays', { orderedIds: ids });
  assert.equal(m.days[2].id, 104);
  assert.equal(m.days[2].date, '2026-10-06');
  assert.equal(m.days[3].items.find((i) => i.kind === 'booking').title, 'Sushi Saito');
  assert.equal(s.state.reservations.find((r) => r.id === 5).reservation_time, '2026-10-07T19:00');
});

test('reorderDays: a move that inverts a stay is blocked before any write', async () => {
  const s = await setup({ upstream: true });
  const ids = dayIds();
  // Move the Gracery check-out day (Oct 9, id 106) before its check-in (Oct 5, id 102).
  ids.splice(ids.indexOf(106), 1);
  ids.splice(0, 0, 106);
  await assert.rejects(
    s.plan('reorderDays', { orderedIds: ids }),
    (e: OpError) => e.status === 409 && /check out before/.test(e.message),
  );
});

test('reorderDays: rejects anything but a permutation, and a no-op is empty', async () => {
  const s = await setup({ upstream: true });
  await assert.rejects(s.plan('reorderDays', { orderedIds: dayIds().slice(1) }), /exactly once/);
  await assert.rejects(s.plan('reorderDays', { orderedIds: [...dayIds().slice(1), 101, 101] }), /exactly once/);
  const p = await s.plan('reorderDays', { orderedIds: dayIds() });
  assert.equal(p.calls.length, 0);
});
