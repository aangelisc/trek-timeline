// Operations on a trip: each op is planned first (validated, described, turned into
// ctx calls) and applied only once the page has shown the impact.
import type { Capabilities, OperationArgs, OperationName } from '../../shared/types.ts';
import type { Snapshot } from '../load.ts';
import type { TimelineCtx } from '../trek.ts';
import { editBooking, moveBooking, shiftBooking } from './bookings.ts';
import { reorderDays } from './days.ts';
import { fail } from './errors.ts';
import { assignPlace, moveItem } from './items.ts';
import { editStay, moveStay } from './stays.ts';
import type { Call, Plan, PlanInput, PlanPart } from './types.ts';

export { OpError } from './errors.ts';
export type { Call, Plan } from './types.ts';

/**
 * What this TREK can do for a plugin. Reordering days and moving items between days
 * need plugin methods that TREK does not expose yet (see docs/PLAN.md, Phase 1); the
 * UI turns those gestures off until the host ships them.
 */
export function capabilities(ctx: TimelineCtx): Capabilities {
  return {
    reorderDays: typeof (ctx.days && ctx.days.reorder) === 'function',
    moveItems: typeof (ctx.itinerary && ctx.itinerary.move) === 'function',
    reorderItems: typeof (ctx.itinerary && ctx.itinerary.reorder) === 'function',
    moveNotes: typeof (ctx.daynotes && ctx.daynotes.move) === 'function',
  };
}

const PLANNERS: {
  [K in OperationName]: (snap: PlanInput, args: OperationArgs[K]) => PlanPart;
} = {
  reorderDays,
  moveItem,
  assignPlace,
  moveBooking,
  shiftBooking,
  moveStay,
  editStay,
  editBooking,
};

function isOp(op: unknown): op is OperationName {
  return typeof op === 'string' && Object.hasOwn(PLANNERS, op);
}

/**
 * Plan an operation without touching TREK: validate it, describe its impact, and list
 * the ctx calls that carry it out. `destructive` asks the UI to confirm first. `op`
 * and `args` come from the page, so each planner coerces what it reads.
 */
export function planOp(snapshot: Snapshot, tripId: number, op: unknown, args: unknown, caps: Capabilities): Plan {
  if (!isOp(op)) fail(`unknown operation "${String(op)}"`);
  const planner = PLANNERS[op] as (snap: PlanInput, args: unknown) => PlanPart;
  const plan = planner({ ...snapshot, tripId, caps }, args || {});
  return { op, destructive: false, summary: [], ...plan };
}

function upstream<F>(fn: F | undefined, name: string): F {
  if (!fn) fail(`${name} needs a newer TREK (the plugin API can't do this yet)`, 501);
  return fn;
}

export async function applyPlan(ctx: TimelineCtx, plan: Plan): Promise<unknown[]> {
  const results: unknown[] = [];
  for (const call of plan.calls) results.push(await apply(ctx, call));
  return results;
}

function apply(ctx: TimelineCtx, call: Call): Promise<unknown> {
  switch (call.method) {
    case 'days.reorder':
      return upstream(ctx.days.reorder, call.method).call(ctx.days, ...call.args);
    case 'itinerary.assign':
      return ctx.itinerary.assign(...call.args);
    case 'itinerary.move':
      return upstream(ctx.itinerary.move, call.method).call(ctx.itinerary, ...call.args);
    case 'itinerary.reorder':
      return upstream(ctx.itinerary.reorder, call.method).call(ctx.itinerary, ...call.args);
    case 'daynotes.update':
      return ctx.daynotes.update(...call.args);
    case 'daynotes.move':
      return upstream(ctx.daynotes.move, call.method).call(ctx.daynotes, ...call.args);
    case 'accommodations.update':
      return ctx.accommodations.update(...call.args);
    case 'reservations.update':
      return ctx.reservations.update(...call.args);
    default:
      return fail('unknown call', 500);
  }
}
