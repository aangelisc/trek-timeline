import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, dayIds } from '../support/ops.ts';
import { dayId } from '../fixtures/trip.ts';
import { capabilities } from '../../src/server/operations/index.ts';
import type { OpError } from '../../src/server/operations/index.ts';

test('capabilities follow what the host exposes', async () => {
  assert.deepEqual(capabilities((await setup()).ctx), {
    reorderDays: false,
    moveItems: false,
    reorderItems: false,
    moveNotes: false,
  });
  assert.deepEqual(capabilities((await setup({ upstream: true })).ctx), {
    reorderDays: true,
    moveItems: true,
    reorderItems: true,
    moveNotes: true,
  });
});

test('unknown operations and gated gestures are refused with a reason', async () => {
  const s = await setup();
  await assert.rejects(s.plan('dropTable', {}), /unknown operation/);
  await assert.rejects(s.plan('toString', {}), /unknown operation/);
  await assert.rejects(s.plan('reorderDays', { orderedIds: dayIds() }), (e: OpError) => e.status === 501);
  await assert.rejects(
    s.plan('moveItem', { kind: 'place', id: 1, toDayId: dayId('2026-10-06') }),
    (e: OpError) => e.status === 501,
  );
  await assert.rejects(
    s.plan('moveItem', { kind: 'note', id: 1, toDayId: dayId('2026-10-06') }),
    (e: OpError) => e.status === 501,
  );
});
