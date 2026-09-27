// Plan and apply operations against the in-memory TREK, as the /op route does.
import { loadTrip } from '../../src/server/load.ts';
import { capabilities, planOp, applyPlan } from '../../src/server/operations/index.ts';
import type { Plan } from '../../src/server/operations/index.ts';
import type { RawEndpoint } from '../../src/server/trek.ts';
import { createFakeTrek } from './fake-trek.ts';
import type { FakeTrekOptions } from './fake-trek.ts';
import { TRIP_ID } from '../fixtures/trip.ts';

export async function setup(opts: FakeTrekOptions = {}) {
  const fake = createFakeTrek(opts);
  const plan = async (op: string, args: unknown) =>
    planOp(await loadTrip(fake.ctx, TRIP_ID), TRIP_ID, op, args, capabilities(fake.ctx));
  const run = async (op: string, args: unknown) => {
    await applyPlan(fake.ctx, await plan(op, args));
    return (await loadTrip(fake.ctx, TRIP_ID)).model;
  };
  return { ...fake, plan, run };
}

/** The input a plan's first call sends (reservations.update, accommodations.update). */
export const inputOf = (p: Plan) => p.calls[0].args[2] as { endpoints?: RawEndpoint[]; [field: string]: unknown };

/** Every day id of the fixture trip, in order. */
export const dayIds = () => Array.from({ length: 13 }, (_, i) => 101 + i);
