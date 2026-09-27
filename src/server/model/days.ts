import type { DayItem, ModelDay, Stay, UnscheduledPlace } from '../../shared/types.ts';
import { datePart, timePart } from '../time.ts';
import type { RawAssignment, RawDay, RawPlace, RawReservation } from '../trek.ts';

function placeOf(a: RawAssignment): RawPlace | RawAssignment {
  // formatAssignmentWithPlace nests the place; older payloads were flat.
  return a.place && typeof a.place === 'object' ? a.place : a;
}

/**
 * Each day's plan: its places, notes and non-transport bookings, in TREK's order.
 * Also returns the ids of every place planned somewhere, for the tray.
 */
export function buildDays(
  days: RawDay[],
  bookingsByDay: Map<number, RawReservation[]>,
): { days: ModelDay[]; assignedPlaceIds: Set<number> } {
  const assignedPlaceIds = new Set<number>();
  const out = days.map((d, i): ModelDay => {
    const items: DayItem[] = [];
    (d.assignments || []).forEach((a, k) => {
      const p = placeOf(a);
      const placeId = a.place_id ?? p.id;
      assignedPlaceIds.add(placeId);
      const category =
        p.category ||
        (a.category_name
          ? {
              name: a.category_name,
              color: a.category_color,
              icon: a.category_icon,
            }
          : null);
      items.push({
        kind: 'place',
        id: a.id,
        placeId,
        title: p.name ?? a.place_name ?? 'Place',
        time: a.place_time ?? p.place_time ?? null,
        category: category ? { name: category.name ?? null, color: category.color ?? null } : null,
        order: a.order_index ?? k,
      });
    });
    (d.notes_items || []).forEach((n, k) => {
      items.push({
        kind: 'note',
        id: n.id,
        title: n.text || '',
        time: n.time || null,
        color: n.color || null,
        order: n.sort_order ?? k,
      });
    });
    (bookingsByDay.get(d.id) || []).forEach((r) => {
      const pos = r.day_positions && r.day_positions[d.id];
      items.push({
        kind: 'booking',
        id: r.id,
        title: r.title || 'Booking',
        type: r.type || null,
        date: datePart(r.reservation_time),
        time: timePart(r.reservation_time),
        status: r.status || null,
        order: pos ?? r.day_plan_position ?? 1e6,
      });
    });
    // TREK interleaves places, notes and bookings on one ordering scale.
    items.sort((a, b) => a.order - b.order);
    return {
      id: d.id,
      index: i,
      number: i + 1,
      date: d.date || null,
      title: d.title || null,
      items,
      cost: 0,
    };
  });
  return { days: out, assignedPlaceIds };
}

/** Places on the trip that no day plans and no stay uses. */
export function unscheduledPlaces(
  places: RawPlace[],
  assignedPlaceIds: Set<number>,
  stays: Stay[],
): UnscheduledPlace[] {
  const stayPlaceIds = new Set(stays.map((s) => s.placeId).filter((x) => x != null));
  return places
    .filter((p) => !assignedPlaceIds.has(p.id) && !stayPlaceIds.has(p.id))
    .map((p) => ({ kind: 'place', id: p.id, title: p.name || 'Place' }));
}
