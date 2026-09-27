import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, inputOf } from '../support/ops.ts';
import { dayId } from '../fixtures/trip.ts';
import type { OpError } from '../../src/server/operations/index.ts';

test('moveBooking: a flight shifts its times, arrival day and legs together', async () => {
  const s = await setup();
  const p = await s.plan('moveBooking', {
    reservationId: 1,
    toDayId: dayId('2026-10-05'),
  });
  assert.equal(p.destructive, true);
  assert.match(p.summary.join('\n'), /\+1 day/);
  assert.match(p.summary.join('\n'), /provider does not/);
  const input = inputOf(p);
  assert.equal(input.reservation_time, '2026-10-05T11:30');
  assert.equal(input.reservation_end_time, '2026-10-06T08:00');
  assert.equal(input.end_day_id, dayId('2026-10-06'));
  assert.deepEqual(
    input.endpoints.map((e) => e.local_date),
    ['2026-10-05', '2026-10-06'],
  );
  assert.ok(input.endpoints.every((e) => !('id' in e) && !('reservation_id' in e)));

  const m = await s.run('moveBooking', {
    reservationId: 1,
    toDayId: dayId('2026-10-05'),
  });
  const ba5 = m.transport.find((t) => t.id === 1);
  assert.equal(Math.floor(ba5.start), 1);
  assert.equal(ba5.durationMin, 750);
});

test('moveBooking: a booking that would run past the trip end is refused', async () => {
  const s = await setup();
  await assert.rejects(
    s.plan('moveBooking', { reservationId: 1, toDayId: dayId('2026-10-16') }),
    (e: OpError) => e.status === 409,
  );
});

test('moveBooking: scheduling from the tray dates an undated booking', async () => {
  const s = await setup();
  const p = await s.plan('moveBooking', {
    reservationId: 7,
    toDayId: dayId('2026-10-08'),
  });
  assert.equal(p.destructive, false);
  assert.match(p.summary[0], /from unscheduled/);
  const m = await s.run('moveBooking', {
    reservationId: 7,
    toDayId: dayId('2026-10-08'),
  });
  assert.ok(m.days[4].items.some((i) => i.title === 'Robot show'));
  assert.ok(!m.unscheduled.bookings.some((b) => b.id === 7));
});

test('moveBooking: dropping on its own day is a no-op', async () => {
  const s = await setup();
  const p = await s.plan('moveBooking', {
    reservationId: 5,
    toDayId: dayId('2026-10-06'),
  });
  assert.equal(p.calls.length, 0);
});

test('editBooking: a departure time edit updates the booking and its first leg', async () => {
  const s = await setup();
  const p = await s.plan('editBooking', {
    reservationId: 2,
    fields: { depTime: '09:30', status: 'confirmed' },
  });
  const input = inputOf(p);
  assert.equal(input.reservation_time, '2026-10-09T09:30');
  assert.equal(input.endpoints.find((e) => e.role === 'from').local_time, '09:30');
  assert.equal(input.endpoints.find((e) => e.role === 'to').local_time, '12:15');
  await assert.rejects(s.plan('editBooking', { reservationId: 2, fields: { title: '  ' } }), /needs a title/);
});

test('shiftBooking: a later train keeps its time in transit', async () => {
  const s = await setup();
  const p = await s.plan('shiftBooking', { reservationId: 2, minutes: 90 });
  assert.equal(p.destructive, true);
  assert.match(p.summary[0], /later by 1h 30m \(departs 11:30, was 10:00\)/);
  const input = inputOf(p);
  assert.equal(input.reservation_time, '2026-10-09T11:30');
  assert.equal(input.reservation_end_time, '2026-10-09T13:45');
  assert.deepEqual(
    input.endpoints.map((e) => e.local_time),
    ['11:30', '13:45'],
  );
  assert.equal(input.day_id, dayId('2026-10-09'));
  const m = await s.run('shiftBooking', { reservationId: 2, minutes: 90 });
  const t = m.transport.find((x) => x.id === 2);
  assert.equal(t.dep.time, '11:30');
  assert.equal(t.durationMin, 135);
});

test('shiftBooking: crossing midnight moves the dates, the day and the arrival day', async () => {
  const s = await setup();
  // BA5 departs Oct 4 11:30 London, lands Oct 5 08:00 Tokyo. 13h later: Oct 5 00:30 → Oct 5 21:00.
  const p = await s.plan('shiftBooking', {
    reservationId: 1,
    minutes: 13 * 60,
  });
  const input = inputOf(p);
  assert.deepEqual(
    input.endpoints.map((e) => `${e.local_date} ${e.local_time}`),
    ['2026-10-05 00:30', '2026-10-05 21:00'],
  );
  assert.equal(input.day_id, dayId('2026-10-05'));
  assert.equal(input.end_day_id, dayId('2026-10-05'));
  assert.match(p.summary.join('\n'), /departs 1 day later/);
  const m = await s.run('shiftBooking', { reservationId: 1, minutes: 13 * 60 });
  assert.equal(m.transport.find((x) => x.id === 1).durationMin, 750);
});

test('shiftBooking: refuses to leave the trip and ignores a zero shift', async () => {
  const s = await setup();
  await assert.rejects(
    s.plan('shiftBooking', { reservationId: 4, minutes: 12 * 60 }),
    (e: OpError) => e.status === 409,
  );
  assert.equal((await s.plan('shiftBooking', { reservationId: 4, minutes: 0 })).calls.length, 0);
  await assert.rejects(s.plan('shiftBooking', { reservationId: 4, minutes: 'soon' }), /minutes/);
});
