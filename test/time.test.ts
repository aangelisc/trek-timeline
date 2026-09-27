import test from 'node:test';
import assert from 'node:assert/strict';
import * as t from '../src/server/time.ts';

test('date arithmetic crosses month and year ends', () => {
  assert.equal(t.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(t.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(t.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(t.dayDelta('2026-10-04', '2026-10-16'), 12);
  assert.equal(t.dayDelta('2026-10-16', '2026-10-04'), -12);
  assert.equal(t.addDays('nonsense', 1), null);
});

test('naive datetime parts', () => {
  assert.equal(t.datePart('2026-10-04T11:30'), '2026-10-04');
  assert.equal(t.timePart('2026-10-04T11:30'), '11:30');
  assert.equal(t.timePart('2026-10-04'), null);
  assert.equal(t.withDatePart('2026-10-04T11:30', '2026-10-09'), '2026-10-09T11:30');
  assert.equal(t.withDatePart(null, '2026-10-09'), '2026-10-09');
  assert.equal(t.withTimePart('2026-10-04T11:30', '07:05'), '2026-10-04T07:05');
  assert.equal(t.withTimePart('2026-10-04T11:30', null), '2026-10-04');
  assert.equal(t.minutesOf('07:05'), 425);
  assert.equal(t.minutesOf('x'), null);
});

test('local times convert to UTC through their zone, DST included', () => {
  // London is on BST (+1) in October until the 25th, then GMT.
  assert.equal(
    new Date(t.localToUtc('2026-10-04', '11:30', 'Europe/London')).toISOString(),
    '2026-10-04T10:30:00.000Z',
  );
  assert.equal(
    new Date(t.localToUtc('2026-11-04', '11:30', 'Europe/London')).toISOString(),
    '2026-11-04T11:30:00.000Z',
  );
  assert.equal(new Date(t.localToUtc('2026-10-05', '08:00', 'Asia/Tokyo')).toISOString(), '2026-10-04T23:00:00.000Z');
  assert.equal(t.localToUtc('2026-10-05', '08:00', 'Not/AZone'), null);
  assert.equal(t.localToUtc('2026-10-05', '08:00', null), null);
});

test('shiftLocal rolls over midnight both ways and keeps all-day stamps on their date', () => {
  assert.deepEqual(t.shiftLocal('2026-10-09', '23:30', 45), {
    date: '2026-10-10',
    time: '00:15',
    days: 1,
  });
  assert.deepEqual(t.shiftLocal('2026-10-09', '00:15', -30), {
    date: '2026-10-08',
    time: '23:45',
    days: -1,
  });
  assert.deepEqual(t.shiftLocal('2026-10-09', null, 180), {
    date: '2026-10-09',
    time: null,
    days: 0,
  });
  assert.deepEqual(t.shiftLocal(null, '10:00', 1440 * 2), {
    date: null,
    time: '10:00',
    days: 2,
  });
});
