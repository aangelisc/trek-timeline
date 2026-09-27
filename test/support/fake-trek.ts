import { tripFixture, TRIP_ID } from '../fixtures/trip.ts';
import { withDatePart, addDays, dayDelta } from '../../src/server/time.ts';
import type { RawAssignment, RawDay, RawTrek, TimelineCtx } from '../../src/server/trek.ts';

export interface FakeTrekOptions {
  /** Add the plugin methods proposed upstream (days.reorder, itinerary.move, …). */
  upstream?: boolean;
  /** The acting user's settings, by key. */
  settings?: Record<string, unknown>;
  /** Called with each core event a write fires, like TREK's event bus. */
  onEvent?: (event: string, tripId: number) => void;
  data?: RawTrek;
}

export interface FakeTrek {
  ctx: TimelineCtx;
  state: RawTrek;
}

/**
 * An in-memory TREK for integration tests and the local sandbox. Unlike the SDK's
 * mock host (a plain fixture store), it keeps TREK's semantics where the timeline
 * depends on them: getDays embeds assignments and notes, and day reordering pins
 * dates to positions and re-dates the bookings on moved days, as days.service does.
 *
 * `upstream: true` adds the plugin methods proposed in docs/PLAN.md Phase 1
 * (days.reorder, itinerary.move, itinerary.reorder, daynotes.move), so the gated
 * gestures can be exercised before TREK ships them.
 */
export function createFakeTrek({
  upstream = false,
  settings = {},
  onEvent = () => {},
  data,
}: FakeTrekOptions = {}): FakeTrek {
  const state = data || tripFixture();
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  const emit = (event: string) => onEvent(event, TRIP_ID);

  const assertTrip = (tripId: number) => {
    if (Number(tripId) !== TRIP_ID) throw new Error(`RESOURCE_FORBIDDEN: no trip ${tripId}`);
  };
  const day = (id: number): RawDay & { assignments: RawAssignment[] } => {
    const d = state.days.find((x) => x.id === Number(id));
    if (!d) throw new Error(`RESOURCE_FORBIDDEN: no day ${id}`);
    d.assignments ??= [];
    d.notes_items ??= [];
    return d as RawDay & { assignments: RawAssignment[] };
  };
  const renumber = (d: RawDay) =>
    (d.assignments || []).forEach((a, i) => {
      a.order_index = i;
    });
  const findAssignment = (id: number) => {
    for (const d of state.days) {
      const i = (d.assignments || []).findIndex((a) => a.id === Number(id));
      if (i >= 0) return { d: day(d.id), i };
    }
    throw new Error(`RESOURCE_FORBIDDEN: no assignment ${id}`);
  };
  let nextId = 1000;

  const ctx: TimelineCtx = {
    trips: {
      async getById(tripId) {
        assertTrip(tripId);
        return clone(state.trip);
      },
      async getDays(tripId) {
        assertTrip(tripId);
        return clone(state.days);
      },
      async getReservations(tripId) {
        assertTrip(tripId);
        return clone(state.reservations);
      },
      async getAccommodations(tripId) {
        assertTrip(tripId);
        return clone(
          state.accommodations.map((a) => ({
            ...a,
            place_name: state.places.find((p) => p.id === a.place_id)?.name,
          })),
        );
      },
      async getPlaces(tripId) {
        assertTrip(tripId);
        return clone(state.places);
      },
    },
    costs: {
      async getByTrip(tripId) {
        assertTrip(tripId);
        return clone(state.costs);
      },
    },
    settings: {
      async get(key) {
        return settings[key];
      },
    },
    log: { info() {}, warn() {}, error() {} },

    accommodations: {
      async update(tripId, id, input) {
        assertTrip(tripId);
        const a = state.accommodations.find((x) => x.id === Number(id));
        if (!a) throw new Error(`RESOURCE_FORBIDDEN: no accommodation ${id}`);
        Object.assign(a, input);
        emit('accommodation:updated');
        return clone(a);
      },
    },
    reservations: {
      async update(tripId, id, input) {
        assertTrip(tripId);
        const r = state.reservations.find((x) => x.id === Number(id));
        if (!r) throw new Error(`RESOURCE_FORBIDDEN: no reservation ${id}`);
        const { endpoints, ...rest } = input as {
          endpoints?: typeof r.endpoints;
        };
        Object.assign(r, rest);
        if (endpoints)
          r.endpoints = endpoints.map((e, i) => ({
            ...e,
            id: nextId++,
            reservation_id: r.id,
            sequence: e.sequence ?? i,
          }));
        emit('reservation:updated');
        return clone(r);
      },
    },
    itinerary: {
      async assign(tripId, dayId, placeId, notes) {
        assertTrip(tripId);
        const d = day(dayId);
        const p = state.places.find((x) => x.id === Number(placeId));
        if (!p) throw new Error(`RESOURCE_FORBIDDEN: no place ${placeId}`);
        const a = {
          id: nextId++,
          day_id: d.id,
          place_id: p.id,
          order_index: d.assignments.length,
          notes: notes ?? null,
          place: { id: p.id, name: p.name },
        };
        d.assignments.push(a);
        emit('assignment:created');
        return clone(a);
      },
      async unassign(tripId, id) {
        assertTrip(tripId);
        const { d, i } = findAssignment(id);
        d.assignments.splice(i, 1);
        renumber(d);
        emit('assignment:deleted');
        return { deleted: true };
      },
    },
    daynotes: {
      // Mirrors the host: update cannot change a note's day.
      async update(tripId, dayId, noteId, input) {
        assertTrip(tripId);
        const n = (day(dayId).notes_items || []).find((x) => x.id === Number(noteId));
        if (!n) throw new Error(`RESOURCE_FORBIDDEN: no note ${noteId} on day ${dayId}`);
        for (const k of ['text', 'time', 'icon', 'sort_order', 'color'] as const)
          if (k in input) Object.assign(n, { [k]: input[k] });
        emit('dayNote:updated');
        return clone(n);
      },
    },
    days: {},
  };

  if (upstream) {
    ctx.days.reorder = async (tripId, orderedIds) => {
      assertTrip(tripId);
      const ids = orderedIds.map(Number);
      if (ids.length !== state.days.length || !ids.every((id) => state.days.some((d) => d.id === id))) {
        throw new Error('orderedIds must be a permutation of the trip day ids.');
      }
      const oldDate = new Map(state.days.map((d) => [d.id, d.date]));
      const dates = state.days
        .map((d) => d.date)
        .filter((x): x is string => !!x)
        .sort();
      const reordered = ids.map((id, i) => Object.assign(day(id), { day_number: i + 1, date: dates[i] ?? null }));
      const pos = new Map(reordered.map((d, i) => [d.id, i]));
      for (const a of state.accommodations) {
        if (pos.get(a.start_day_id)! > pos.get(a.end_day_id)!) {
          throw new Error('This move would make an accommodation end before it starts.');
        }
      }
      state.days = reordered;
      // days.service#restampReservationDates
      for (const r of state.reservations) {
        if (r.day_id == null || !r.reservation_time) continue;
        const before = oldDate.get(r.day_id);
        const after = day(r.day_id).date;
        if (before && after && before !== after) {
          r.reservation_time = withDatePart(r.reservation_time, after);
          const delta = dayDelta(before, after)!;
          for (const e of r.endpoints || []) if (e.local_date) e.local_date = addDays(e.local_date, delta);
        }
      }
      emit('day:reordered');
      return clone(state.days);
    };
    ctx.itinerary.move = async (tripId, assignmentId, newDayId, orderIndex) => {
      assertTrip(tripId);
      const { d, i } = findAssignment(assignmentId);
      const to = day(newDayId);
      const [a] = d.assignments.splice(i, 1);
      a.day_id = to.id;
      to.assignments.splice(Math.min(orderIndex ?? to.assignments.length, to.assignments.length), 0, a);
      renumber(d);
      renumber(to);
      emit('assignment:moved');
      return clone(a);
    };
    ctx.itinerary.reorder = async (tripId, dayId, orderedIds) => {
      assertTrip(tripId);
      const d = day(dayId);
      const ids = orderedIds.map(Number);
      if (ids.length !== d.assignments.length) throw new Error('orderedIds must list every assignment of the day');
      d.assignments = ids.map((id) => {
        const a = d.assignments.find((x) => x.id === id);
        if (!a) throw new Error(`RESOURCE_FORBIDDEN: no assignment ${id} on day ${dayId}`);
        return a;
      });
      renumber(d);
      emit('assignment:reordered');
      return { ok: true };
    };
    ctx.daynotes.move = async (tripId, noteId, fromDayId, toDayId, sortOrder) => {
      assertTrip(tripId);
      const from = day(fromDayId);
      const notes = from.notes_items || [];
      const i = notes.findIndex((n) => n.id === Number(noteId));
      if (i < 0) throw new Error(`RESOURCE_FORBIDDEN: no note ${noteId} on day ${fromDayId}`);
      const [n] = notes.splice(i, 1);
      Object.assign(n, {
        day_id: Number(toDayId),
        sort_order: sortOrder ?? n.sort_order,
      });
      (day(toDayId).notes_items ??= []).push(n);
      emit('dayNote:updated');
      return clone(n);
    };
  }

  return { ctx, state };
}
