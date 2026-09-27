import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModel } from '../src/server/model/index.ts';
import { computeWarnings, toTripWarnings } from '../src/server/warnings.ts';
import type { WarningOptions } from '../src/server/warnings.ts';
import type { RawTrek } from '../src/server/trek.ts';
import type { Warning } from '../src/shared/types.ts';
import { tripFixture, dayId } from './fixtures/trip.ts';

const warn = (f?: RawTrek | null, opts?: WarningOptions) => computeWarnings(buildModel(f || tripFixture()), opts);
const rules = (ws: Warning[]) => ws.map((w) => w.rule);

test('the fixture trip trips every rule once', () => {
  assert.deepEqual(rules(warn()), [
    'stay-overlap',
    'date-mismatch',
    'missing-stay',
    'late-arrival',
    'outside-trip',
    'empty-day',
  ]);
});

test('errors sort first, then by day', () => {
  const ws = warn();
  assert.equal(ws[0].level, 'error');
  const warnings = ws.filter((w) => w.level === 'warning' && w.dayIndex != null);
  assert.deepEqual(
    warnings.map((w) => w.dayIndex),
    [...warnings.map((w) => w.dayIndex)].sort((a, b) => a - b),
  );
});

test('missing-stay groups consecutive nights and ignores the last day', () => {
  const f = tripFixture();
  f.accommodations = f.accommodations.filter((a) => a.id !== 2); // drop Kyoto: nights 6..9 open
  const w = warn(f).filter((x) => x.rule === 'missing-stay');
  assert.equal(w.length, 1);
  assert.equal(w[0].dayId, dayId('2026-10-09'));
  assert.equal(w[0].dayIds.length, 4);
  assert.match(w[0].message, /4 nights/);
});

test('an overnight journey counts as a place to sleep', () => {
  const f = tripFixture();
  // Without the BA5 overnight flight, night 1 needs a bed.
  f.reservations = f.reservations.filter((r) => r.id !== 1);
  assert.ok(warn(f).some((w) => w.rule === 'missing-stay' && w.dayId === dayId('2026-10-04')));
  assert.ok(!warn().some((w) => w.rule === 'missing-stay' && w.dayId === dayId('2026-10-04')));
});

test('stay-overlap names both stays and the nights shared', () => {
  const w = warn().find((x) => x.rule === 'stay-overlap');
  assert.deepEqual(w.stayIds.sort(), [1, 4]);
  assert.match(w.message, /1 night/);
});

test('late-arrival only fires past the check-in window', () => {
  const f = tripFixture();
  f.accommodations.find((a) => a.id === 3).check_in_end = '22:00';
  assert.ok(!warn(f).some((w) => w.rule === 'late-arrival'));
  f.accommodations.find((a) => a.id === 3).check_in_end = null;
  assert.ok(!warn(f).some((w) => w.rule === 'late-arrival'));
});

test('date-mismatch compares the day date with the booking date', () => {
  const f = tripFixture();
  f.reservations.find((r) => r.id === 6).reservation_time = '2026-10-07T15:00';
  assert.ok(!warn(f).some((w) => w.rule === 'date-mismatch'));
});

test('empty-day treats travel days as busy and can be switched off', () => {
  const ws = warn().filter((w) => w.rule === 'empty-day');
  assert.deepEqual(
    ws.map((w) => w.dayId),
    [dayId('2026-10-08')],
  );
  assert.ok(!warn(null, { emptyDays: false }).some((w) => w.rule === 'empty-day'));
  assert.ok(!warn(null, { missingStays: false }).some((w) => w.rule === 'missing-stay'));
});

test('an undated trip skips the date rules', () => {
  const f = tripFixture();
  for (const d of f.days) d.date = null;
  const r = rules(warn(f));
  assert.ok(!r.includes('outside-trip'));
  assert.ok(!r.includes('date-mismatch'));
});

test('TREK warnings are capped at 20 and trimmed to 300 chars', () => {
  const w = (level: Warning['level'], message: string, dayId?: number): Warning => ({
    id: 'x',
    rule: 'empty-day',
    level,
    message,
    dayId,
  });
  const many = Array.from({ length: 30 }, (_, i) => w('info', 'x'.repeat(400), i));
  const out = toTripWarnings(many);
  assert.equal(out.length, 20);
  assert.equal(out[0].message.length, 300);
  assert.deepEqual(Object.keys(toTripWarnings([w('warning', 'm')])[0]), ['level', 'message']);
});
