import type { DayItem, ModelDay, OperationArgs } from '../../shared/types.ts';
import { moveBooking } from './bookings.ts';
import { fail } from './errors.ts';
import { dayById, label, requireCap } from './helpers.ts';
import type { PlanInput, PlanPart } from './types.ts';

/**
 * Move a plan item. `toPosition` is its index among ALL items of the target day,
 * counted with the dragged item already taken out.
 */
export function moveItem(snap: PlanInput, { kind, id, toDayId, toPosition }: OperationArgs['moveItem']): PlanPart {
  const { model, tripId, caps } = snap;
  if (kind === 'booking') return moveBooking(snap, { reservationId: id, toDayId });

  const is = (it: DayItem) => it.kind === kind && it.id === Number(id);
  let from: ModelDay | undefined;
  let item: DayItem | undefined;
  for (const d of model.days) {
    item = d.items.find(is);
    if (item) {
      from = d;
      break;
    }
  }
  if (!from || !item) fail(`no ${kind} ${id} in the plan`);
  const to = dayById(model, toDayId);
  const target = to.items.filter((it) => !is(it));
  const pos = Math.max(
    0,
    Math.min(Number.isFinite(Number(toPosition)) ? Number(toPosition) : target.length, target.length),
  );

  if (kind === 'place') {
    const placeIndex = target.slice(0, pos).filter((it) => it.kind === 'place').length;
    if (to.id === from.id) {
      requireCap(caps, 'reorderItems', 'Reordering places within a day');
      const places = target.filter((it) => it.kind === 'place').map((it) => it.id);
      places.splice(placeIndex, 0, item.id);
      return {
        summary: [`Reorders ${item.title} within ${label(to)}.`],
        calls: [{ method: 'itinerary.reorder', args: [tripId, to.id, places] }],
      };
    }
    requireCap(caps, 'moveItems', 'Moving places between days');
    return {
      summary: [`Moves ${item.title} from ${label(from)} to ${label(to)}.`],
      calls: [
        {
          method: 'itinerary.move',
          args: [tripId, item.id, to.id, placeIndex],
        },
      ],
    };
  }

  if (kind === 'note') {
    // A note's sort_order sits on the same scale as its neighbours', so the midpoint
    // between them lands it exactly where it was dropped.
    const before = target[pos - 1];
    const after = target[pos];
    const sortOrder =
      before && after ? (before.order + after.order) / 2 : before ? before.order + 1 : after ? after.order - 1 : 0;
    if (to.id === from.id) {
      return {
        summary: [`Reorders the note within ${label(to)}.`],
        calls: [
          {
            method: 'daynotes.update',
            args: [tripId, to.id, item.id, { sort_order: sortOrder }],
          },
        ],
      };
    }
    requireCap(caps, 'moveNotes', 'Moving notes between days');
    return {
      summary: [`Moves the note "${item.title}" to ${label(to)}.`],
      calls: [
        {
          method: 'daynotes.move',
          args: [tripId, item.id, from.id, to.id, sortOrder],
        },
      ],
    };
  }
  return fail(`can't move a ${String(kind)}`);
}

export function assignPlace(
  { model, tripId, raw }: PlanInput,
  { placeId, dayId }: OperationArgs['assignPlace'],
): PlanPart {
  const day = dayById(model, dayId);
  const place = (raw.places || []).find((p) => p.id === Number(placeId));
  if (!place) fail(`no place ${placeId} on this trip`);
  return {
    summary: [`Adds ${place.name || 'the place'} to ${label(day)}.`],
    calls: [{ method: 'itinerary.assign', args: [tripId, day.id, place.id] }],
  };
}
