import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockHost } from 'trek-plugin-sdk/testing';
import type { MockHostOptions, PluginDriver } from 'trek-plugin-sdk/testing';
import type { PluginResponse, TripWarning } from 'trek-plugin-sdk';
import type { Failure, OpResponse } from '../src/shared/types.ts';

/** Any route's answer: every field optional, so each test reads what its route returns. */
type Body = Partial<Omit<Exclude<OpResponse, Failure>, 'ok'> & Omit<Failure, 'ok'>>;
import plugin from '../src/server/index.ts';
import manifest from '../trek-plugin.json' with { type: 'json' };
import { mockTrips, TRIP_ID, dayId } from './fixtures/trip.ts';

const ALL = manifest.permissions;
const READ = ['db:read:trips', 'db:read:costs', 'hook:trip-warning-provider'];

interface HostOptions {
  grants?: string[];
  members?: number[];
  userSettings?: MockHostOptions['userSettings'];
}

function host({ grants = ALL, members = [1], userSettings }: HostOptions = {}) {
  const h = createMockHost({
    grants,
    trips: mockTrips(members),
    actingUserId: 1,
    userSettings,
  });
  return { h, drv: h.run(plugin) };
}

const body = (res: PluginResponse): Body => JSON.parse(String(res.body));
// Handled failures answer HTTP 200 with the real status in the body (see errorResponse).
const status = (res: PluginResponse): number => (res.status === 200 ? body(res).status || 200 : res.status);
const get = (drv: PluginDriver, query: Record<string, unknown>) =>
  drv.route({ method: 'GET', path: '/timeline' }, { query });
const op = (drv: PluginDriver, b: unknown) => drv.route({ method: 'POST', path: '/op' }, { body: b });

test('GET /timeline returns the model, warnings and capabilities', async () => {
  const { drv } = host();
  const res = await get(drv, { tripId: String(TRIP_ID) });
  assert.equal(status(res), 200);
  const b = body(res);
  assert.equal(b.model.days.length, 13);
  assert.equal(b.model.costs.available, true);
  assert.ok(b.warnings.length >= 5);
  // The SDK's mock host (like TREK today) has no reorder/move methods.
  assert.deepEqual(b.capabilities, {
    reorderDays: false,
    moveItems: false,
    reorderItems: false,
    moveNotes: false,
  });
});

test('GET /timeline validates the trip id and membership', async () => {
  const { drv } = host();
  assert.equal(status(await get(drv, {})), 400);
  assert.equal(status(await get(drv, { tripId: 'abc' })), 400);
  const { drv: outsider } = host({ members: [2] });
  const res = await get(outsider, { tripId: '1' });
  assert.equal(status(res), 403);
});

test('without the costs grant the timeline still loads, costs marked unavailable', async () => {
  const { drv } = host({ grants: ALL.filter((g) => g !== 'db:read:costs') });
  const b = body(await get(drv, { tripId: '1' }));
  assert.equal(b.model.costs.available, false);
  assert.equal(b.model.days.length, 13);
});

test('user settings switch warning rules off', async () => {
  const { drv } = host({
    userSettings: { warn_empty_days: false, warn_missing_stays: false },
  });
  const b = body(await get(drv, { tripId: '1' }));
  assert.ok(!b.warnings.some((w) => w.rule === 'empty-day' || w.rule === 'missing-stay'));
});

test('POST /op dry run returns the impact and writes nothing', async () => {
  const { h, drv } = host();
  const res = await op(drv, {
    tripId: 1,
    op: 'moveStay',
    args: {
      stayId: 2,
      startDayId: dayId('2026-10-09'),
      endDayId: dayId('2026-10-13'),
    },
    dryRun: true,
  });
  assert.equal(status(res), 200);
  const b = body(res);
  assert.equal(b.impact.destructive, true);
  assert.ok(b.impact.summary.length > 0);
  assert.ok(!h.calls.some((c) => c.method === 'accommodations.update'));
});

test('POST /op applies and returns the fresh timeline', async () => {
  const { h, drv } = host();
  const res = await op(drv, {
    tripId: 1,
    op: 'moveStay',
    args: {
      stayId: 2,
      startDayId: dayId('2026-10-09'),
      endDayId: dayId('2026-10-13'),
    },
  });
  assert.equal(status(res), 200);
  const b = body(res);
  assert.equal(b.model.stays.find((s) => s.id === 2).nights, 4);
  assert.ok(h.calls.some((c) => c.method === 'accommodations.update'));
});

test('POST /op accepts a JSON string body', async () => {
  const { drv } = host();
  const res = await op(
    drv,
    JSON.stringify({
      tripId: 1,
      op: 'assignPlace',
      args: { placeId: 30, dayId: 101 },
      dryRun: true,
    }),
  );
  assert.equal(status(res), 200);
});

test('POST /op without write grants answers 403 read-only; dry runs still work', async () => {
  const { drv } = host({ grants: READ });
  const args = {
    stayId: 2,
    startDayId: dayId('2026-10-09'),
    endDayId: dayId('2026-10-13'),
  };
  assert.equal(status(await op(drv, { tripId: 1, op: 'moveStay', args, dryRun: true })), 200);
  const res = await op(drv, { tripId: 1, op: 'moveStay', args });
  assert.equal(status(res), 403);
  assert.equal(body(res).readOnly, true);
});

test('POST /op reports gated gestures as 501 and bad input as 400', async () => {
  const { drv } = host();
  const gated = await op(drv, {
    tripId: 1,
    op: 'reorderDays',
    args: { orderedIds: [] },
  });
  assert.equal(status(gated), 501);
  const bad = await op(drv, {
    tripId: 1,
    op: 'moveStay',
    args: { stayId: 1, startDayId: 105, endDayId: 104 },
  });
  assert.equal(status(bad), 400);
  assert.match(body(bad).error, /at least one night/);
});

test('warningProvider feeds TREK the capped list', async () => {
  const { drv } = host();
  const ws = await drv.hook<TripWarning[]>('warningProvider', 'getWarnings', TRIP_ID);
  assert.ok(ws.length > 0 && ws.length <= 20);
  assert.equal(ws[0].level, 'error');
  assert.ok(ws.every((w) => typeof w.message === 'string'));
});

test('warningProvider is never called without its grant', async () => {
  const { drv } = host({
    grants: ALL.filter((g) => g !== 'hook:trip-warning-provider'),
  });
  await assert.rejects(drv.hook('warningProvider', 'getWarnings', TRIP_ID));
});
