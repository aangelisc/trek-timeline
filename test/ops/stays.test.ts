import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from '../support/ops.ts';
import { dayId } from '../fixtures/trip.ts';

test('moveStay: resizing previews the night change and new overlaps', async () => {
  const s = await setup();
  const p = await s.plan('moveStay', {
    stayId: 2,
    startDayId: dayId('2026-10-09'),
    endDayId: dayId('2026-10-13'),
  });
  assert.match(p.summary.join('\n'), /4 nights/);
  assert.match(p.summary.join('\n'), /Was 3 nights/);
  assert.equal(p.destructive, true); // it has a confirmation code
  const m = await s.run('moveStay', {
    stayId: 2,
    startDayId: dayId('2026-10-09'),
    endDayId: dayId('2026-10-13'),
  });
  assert.equal(m.stays.find((x) => x.id === 2).nights, 4);
});

test('moveStay: the Airbnb dragged onto the Tokyo hotel is flagged as an overlap', async () => {
  const s = await setup();
  const p = await s.plan('moveStay', {
    stayId: 4,
    startDayId: dayId('2026-10-06'),
    endDayId: dayId('2026-10-07'),
  });
  assert.match(p.summary.join('\n'), /Overlaps Hotel Gracery/);
  assert.equal(p.destructive, false);
});

test('moveStay: zero or negative nights are refused', async () => {
  const s = await setup();
  await assert.rejects(s.plan('moveStay', { stayId: 1, startDayId: 105, endDayId: 105 }), /at least one night/);
  await assert.rejects(s.plan('moveStay', { stayId: 1, startDayId: 105, endDayId: 104 }), /at least one night/);
});

test('editStay: whitelists fields and validates times', async () => {
  const s = await setup();
  const p = await s.plan('editStay', {
    stayId: 1,
    fields: { check_in: '14:00', confirmation: ' NEW-1 ', start_day_id: 999 },
  });
  assert.deepEqual(p.calls[0].args[2], {
    check_in: '14:00',
    confirmation: 'NEW-1',
  });
  await assert.rejects(s.plan('editStay', { stayId: 1, fields: { check_in: '25:00' } }), /not a time/);
  await assert.rejects(s.plan('editStay', { stayId: 1, fields: {} }), /nothing to change/);
});

test('moveStay: new times without new days are saved and need no confirmation', async () => {
  const s = await setup();
  const p = await s.plan('moveStay', {
    stayId: 1,
    startDayId: dayId('2026-10-05'),
    endDayId: dayId('2026-10-09'),
    checkIn: '17:00',
    checkOut: '10:15',
  });
  assert.equal(p.destructive, false);
  assert.match(p.summary[0], /at 17:00.*at 10:15/);
  assert.deepEqual(p.calls[0].args[2], {
    check_in: '17:00',
    check_out: '10:15',
    start_day_id: dayId('2026-10-05'),
    end_day_id: dayId('2026-10-09'),
  });
  const m = await s.run('moveStay', {
    stayId: 1,
    startDayId: dayId('2026-10-05'),
    endDayId: dayId('2026-10-09'),
    checkIn: '17:00',
    checkOut: '10:15',
  });
  assert.equal(m.stays.find((x) => x.id === 1).checkIn, '17:00');
});

test('moveStay: unchanged times and days are a no-op; bad times are refused', async () => {
  const s = await setup();
  const same = await s.plan('moveStay', {
    stayId: 1,
    startDayId: dayId('2026-10-05'),
    endDayId: dayId('2026-10-09'),
    checkIn: '15:00',
  });
  assert.equal(same.calls.length, 0);
  await assert.rejects(
    s.plan('moveStay', {
      stayId: 1,
      startDayId: 102,
      endDayId: 106,
      checkOut: '9am',
    }),
    /not a time/,
  );
});
