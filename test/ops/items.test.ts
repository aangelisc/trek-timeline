import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from '../support/ops.ts';
import { TRIP_ID, dayId } from '../fixtures/trip.ts';

test('moveItem: a place moves between days at the dropped position', async () => {
  const s = await setup({ upstream: true });
  // Drop Senso-ji (Oct 5) second in Oct 10's list: after Fushimi Inari, before the kimono note.
  const m = await s.run('moveItem', {
    kind: 'place',
    id: 1,
    toDayId: dayId('2026-10-10'),
    toPosition: 1,
  });
  assert.deepEqual(
    m.days[6].items.filter((i) => i.kind === 'place').map((i) => i.title),
    ['Fushimi Inari', 'Senso-ji', 'Nishiki Market'],
  );
  assert.ok(!m.days[1].items.some((i) => i.title === 'Senso-ji'));
});

test('moveItem: reordering within a day sends the full place order', async () => {
  const s = await setup({ upstream: true });
  const p = await s.plan('moveItem', {
    kind: 'place',
    id: 2,
    toDayId: dayId('2026-10-05'),
    toPosition: 0,
  });
  assert.deepEqual(p.calls, [
    {
      method: 'itinerary.reorder',
      args: [TRIP_ID, dayId('2026-10-05'), [2, 1]],
    },
  ]);
  const m = await s.run('moveItem', {
    kind: 'place',
    id: 2,
    toDayId: dayId('2026-10-05'),
    toPosition: 0,
  });
  assert.equal(m.days[1].items[0].title, 'Shibuya Sky');
});

test('moveItem: a note reorders within its day today, via sort_order', async () => {
  const s = await setup(); // no upstream needed
  const p = await s.plan('moveItem', {
    kind: 'note',
    id: 1,
    toDayId: dayId('2026-10-05'),
    toPosition: 2,
  });
  assert.equal(p.calls[0].method, 'daynotes.update');
  const m = await s.run('moveItem', {
    kind: 'note',
    id: 1,
    toDayId: dayId('2026-10-05'),
    toPosition: 2,
  });
  assert.deepEqual(
    m.days[1].items.map((i) => i.kind),
    ['place', 'place', 'note'],
  );
});

test('moveItem: a note moves to another day with daynotes.move', async () => {
  const s = await setup({ upstream: true });
  const m = await s.run('moveItem', {
    kind: 'note',
    id: 2,
    toDayId: dayId('2026-10-11'),
    toPosition: 0,
  });
  assert.equal(m.days[7].items[0].title, 'Kimono rental, 9am');
});

test('moveItem: a booking is delegated to moveBooking', async () => {
  const s = await setup();
  const p = await s.plan('moveItem', {
    kind: 'booking',
    id: 5,
    toDayId: dayId('2026-10-07'),
  });
  assert.equal(p.calls[0].method, 'reservations.update');
});

test('assignPlace: a tray place lands on the day', async () => {
  const s = await setup();
  const m = await s.run('assignPlace', {
    placeId: 30,
    dayId: dayId('2026-10-12'),
  });
  assert.ok(m.days[8].items.some((i) => i.title === 'Nara Park'));
  assert.ok(!m.unscheduled.places.some((p) => p.id === 30));
  await assert.rejects(s.plan('assignPlace', { placeId: 999, dayId: 101 }), /no place/);
});
