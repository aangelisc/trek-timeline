import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModel } from '../src/server/model/index.ts';
import { tripFixture } from './fixtures/trip.ts';
import type { PlaceItem } from '../src/shared/types.ts';

const model = () => buildModel(tripFixture());
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-3, `${a} ≈ ${b}`);

test('days keep TREK order and interleave places, notes and bookings', () => {
  const m = model();
  assert.equal(m.days.length, 13);
  assert.deepEqual(
    m.days.map((d) => d.number),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  );
  assert.deepEqual(
    m.days[1].items.map((i) => `${i.kind}:${i.title}`),
    ['place:Senso-ji', 'note:Pick up JR Pass at the airport', 'place:Shibuya Sky'],
  );
  assert.deepEqual(
    m.days[2].items.map((i) => i.kind),
    ['place', 'booking'],
  );
});

test('day order comes from day_number, not from the order rows arrive in', () => {
  const f = tripFixture();
  f.days.reverse();
  assert.equal(buildModel(f).days[0].date, '2026-10-04');
});

test('stays span check-in day to check-out day and pick up their hotel booking', () => {
  const gracery = model().stays.find((s) => s.id === 1);
  assert.equal(gracery.startIndex, 1);
  assert.equal(gracery.endIndex, 5);
  assert.equal(gracery.nights, 4);
  assert.equal(gracery.reservationId, 10);
  assert.equal(gracery.cost, 620);
  assert.equal(gracery.confirmation, 'GRC-4411');
});

test('hotel bookings linked to a stay are not repeated in the plan or tray', () => {
  const m = model();
  const ids = [
    ...m.days.flatMap((d) => d.items.filter((i) => i.kind === 'booking').map((i) => i.id)),
    ...m.unscheduled.bookings.map((b) => b.id),
    ...m.transport.map((t) => t.id),
  ];
  for (const hotel of [10, 11, 12, 13]) assert.ok(!ids.includes(hotel));
});

test('transport runs from local departure to local arrival, with real duration', () => {
  const m = model();
  const ba5 = m.transport.find((t) => t.id === 1);
  close(ba5.start, 0 + 690 / 1440); // Day 1 11:30
  close(ba5.end, 1 + 480 / 1440); // Day 2 08:00 Tokyo time
  assert.equal(ba5.durationMin, 750); // 12h30 in the air
  assert.equal(ba5.crossesTimezones, true);
  assert.equal(ba5.dep.name, 'LHR');
  assert.equal(ba5.arr.name, 'HND');

  const home = m.transport.find((t) => t.id === 4);
  assert.equal(home.durationMin, 770); // westbound: 12:40 KST → 17:30 BST is 12h50
  assert.ok(home.end > home.start);
});

test('transport without endpoint zones falls back to the naive booking times', () => {
  const f = tripFixture();
  const train = f.reservations.find((r) => r.id === 2);
  train.endpoints = [];
  const t = buildModel(f).transport.find((x) => x.id === 2);
  assert.equal(t.durationMin, 135);
  assert.equal(t.durationKnown, true);
});

test('transport with no arrival time still gets a visible bar', () => {
  const f = tripFixture();
  const train = f.reservations.find((r) => r.id === 2);
  train.endpoints = [];
  train.reservation_end_time = null;
  const t = buildModel(f).transport.find((x) => x.id === 2);
  assert.equal(t.durationKnown, false);
  assert.ok(t.end - t.start > 0.05);
});

test('unscheduled tray holds unplanned places and undated bookings', () => {
  const m = model();
  assert.deepEqual(
    m.unscheduled.places.map((p) => p.title),
    ['Nara Park', 'Ghibli Museum'],
  );
  assert.deepEqual(
    m.unscheduled.bookings.map((b) => b.title),
    ['Robot show', 'Hakone onsen day trip'],
  );
  // Stay places are not "unplanned".
  assert.ok(!m.unscheduled.places.some((p) => /Gracery|Ryokan|L7|Airbnb/.test(p.title)));
});

test('costs total in trip currency, by category and by day', () => {
  const m = model();
  assert.equal(m.costs.currency, 'EUR');
  assert.equal(m.costs.total, 4276); // includes 5000 JPY at 0.0062 = 31
  assert.equal(m.costs.byCategory[0].category, 'Accommodation');
  assert.equal(m.costs.byCategory[0].total, 1975);
  assert.equal(m.costs.unallocated, 60); // travel insurance: no date, booking or place
  assert.equal(m.days[0].cost, 850); // BA5
  assert.equal(m.days[1].cost, 620 + 20 + 31); // stay by check-in day, place, dated JPY item
  const perDay = m.days.reduce((s, d) => s + d.cost, 0);
  assert.equal(Math.round((perDay + m.costs.unallocated) * 100) / 100, m.costs.total);
});

test('missing costs (addon off or no grant) still builds a model', () => {
  const f = tripFixture();
  f.costs = [];
  f.costsAvailable = false;
  const m = buildModel(f);
  assert.equal(m.costs.available, false);
  assert.equal(m.costs.total, 0);
});

test('an undated trip positions by day id', () => {
  const f = tripFixture();
  for (const d of f.days) d.date = null;
  for (const r of f.reservations) {
    for (const e of r.endpoints || []) e.local_date = null;
    r.reservation_time = r.reservation_time && `x${r.reservation_time.slice(10)}`;
    r.reservation_end_time = null;
  }
  const m = buildModel(f);
  assert.equal(m.trip.dated, false);
  const train = m.transport.find((t) => t.id === 2);
  close(train.start, 5 + 600 / 1440);
});

test('assignments in the older flat shape are read too', () => {
  const f = tripFixture();
  f.days[1].assignments = [
    {
      id: 99,
      day_id: f.days[1].id,
      place_id: 1,
      order_index: 0,
      place_name: 'Flat place',
      category_name: 'X',
    },
  ];
  const it = buildModel(f).days[1].items.find((i) => i.id === 99) as PlaceItem;
  assert.equal(it.title, 'Flat place');
  assert.equal(it.category.name, 'X');
});
