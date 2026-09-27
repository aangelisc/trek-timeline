import type { BookingSummary, JourneyEnd, Stop, Transport } from '../../shared/types.ts';
import { datePart, localToUtc, minutesOf, parseDate, timePart } from '../time.ts';
import type { RawReservation } from '../trek.ts';
import { round2 } from './costs.ts';
import type { Lookup, PosOf } from './lookup.ts';
import { isStayBooking } from './stays.ts';

// Booking types drawn in the Transport lane. Anything else with two or more
// endpoints counts too, so a type TREK adds later still lands in the right lane.
export const TRANSPORT_TYPES = new Set([
  'flight',
  'train',
  'bus',
  'car',
  'rental_car',
  'ferry',
  'cruise',
  'transfer',
  'taxi',
  'transport',
]);

// A transport bar whose duration is unknown still needs a visible width.
const UNKNOWN_DURATION_MIN = 120;

export function isTransport(r: RawReservation): boolean {
  return TRANSPORT_TYPES.has(String(r.type || '').toLowerCase()) || (r.endpoints || []).length >= 2;
}

export interface PlacedBookings {
  /** The Transport lane, by departure. */
  transport: Transport[];
  /** Bookings with no day to show them on: the tray. */
  unscheduled: BookingSummary[];
  /** Other bookings, by day id, for the Plan lane. */
  byDay: Map<number, RawReservation[]>;
}

/** Sort every booking but the stays' own into the Transport lane, a day's plan, or the tray. */
export function placeBookings(
  reservations: RawReservation[],
  lookup: Lookup,
  costByReservation: Map<number, number>,
): PlacedBookings {
  const { days, dayIndex, dayOnDate, posOf } = lookup;
  const transport: Transport[] = [];
  const unscheduled: BookingSummary[] = [];
  const byDay = new Map<number, RawReservation[]>();

  for (const r of reservations) {
    if (isStayBooking(r)) continue;
    if (!isTransport(r)) {
      const dayId = r.day_id != null && dayIndex.has(r.day_id) ? r.day_id : dayOnDate(datePart(r.reservation_time))?.id;
      if (dayId == null) unscheduled.push(bookingSummary(r, costByReservation));
      else {
        if (!byDay.has(dayId)) byDay.set(dayId, []);
        byDay.get(dayId)!.push(r);
      }
      continue;
    }
    const t = transportTiming(r, posOf);
    if (t.start == null || t.end == null) {
      unscheduled.push(bookingSummary(r, costByReservation));
      continue;
    }
    transport.push({
      ...bookingSummary(r, costByReservation),
      dayId: r.day_id ?? days[Math.floor(t.start)]?.id ?? null,
      endDayId: r.end_day_id ?? null,
      start: t.start,
      end: t.end,
      durationMin: t.durationMin,
      durationKnown: t.durationKnown,
      dep: t.dep,
      arr: t.arr,
      stops: t.stops,
      crossesTimezones: t.crossesTimezones,
    });
  }
  transport.sort((a, b) => a.start - b.start);
  return { transport, unscheduled, byDay };
}

function bookingSummary(r: RawReservation, costByReservation: Map<number, number>): BookingSummary {
  return {
    id: r.id,
    kind: 'booking',
    type: r.type || null,
    title: r.title || 'Booking',
    status: r.status || null,
    confirmation: r.confirmation_number || null,
    reservationTime: r.reservation_time || null,
    reservationEndTime: r.reservation_end_time || null,
    cost: round2(costByReservation.get(r.id) || 0),
  };
}

interface Timing {
  start: number | null;
  end: number | null;
  durationMin: number | null;
  durationKnown: boolean;
  dep: JourneyEnd;
  arr: JourneyEnd;
  stops: Stop[];
  crossesTimezones: boolean;
}

/**
 * Where a transport booking sits on the timeline. Day columns are local days, so the
 * bar runs from the local departure time to the local arrival time, the way a
 * traveller reads a ticket ("leave Sat 11:30, land Sun 08:00"). `durationMin` is the
 * REAL time in transit, from the endpoint zones when both are known, for the label.
 */
function transportTiming(r: RawReservation, posOf: PosOf): Timing {
  const eps = (r.endpoints || []).slice().sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const from = eps.find((e) => e.role === 'from') || eps[0] || null;
  const to = [...eps].reverse().find((e) => e.role === 'to') || (eps.length > 1 ? eps[eps.length - 1] : null);

  const dep: JourneyEnd = {
    name: from ? from.code || from.name || null : null,
    date: (from && from.local_date) || datePart(r.reservation_time),
    time: (from && from.local_time) || timePart(r.reservation_time),
    tz: (from && from.timezone) || null,
  };
  const arr: JourneyEnd = {
    name: to ? to.code || to.name || null : null,
    date: (to && to.local_date) || datePart(r.reservation_end_time) || null,
    time: (to && to.local_time) || timePart(r.reservation_end_time),
    tz: (to && to.timezone) || null,
  };

  const start = posOf(dep.date, dep.time, r.day_id);
  const depUtc = localToUtc(dep.date, dep.time, dep.tz);
  let durationMin: number | null = null;

  if (depUtc != null) {
    const arrUtc = localToUtc(arr.date || dep.date, arr.time, arr.tz);
    if (arrUtc != null) {
      durationMin = (arrUtc - depUtc) / 60000;
      // An arrival with no date that reads "before" departure landed the next day.
      if (durationMin < 0 && !arr.date) durationMin += 1440;
    }
  }
  if (durationMin == null) {
    const a = parseDate(arr.date || dep.date);
    const b = parseDate(dep.date);
    const am = minutesOf(arr.time);
    const bm = minutesOf(dep.time);
    if (a != null && b != null && am != null && bm != null) {
      durationMin = (a - b) / 60000 + am - bm;
      if (durationMin < 0 && !arr.date) durationMin += 1440;
    }
  }
  const durationKnown = durationMin != null && durationMin > 0;
  let end: number | null = null;
  if (start != null) {
    const arrPos = arr.time ? posOf(arr.date || dep.date, arr.time, null) : null;
    // Without a placeable arrival (or one that reads as before departure after a
    // westward zone change), fall back to start + time in transit.
    end =
      arrPos != null && arrPos > start ? arrPos : start + (durationKnown ? durationMin! : UNKNOWN_DURATION_MIN) / 1440;
  }

  const stops = eps
    .filter((e) => e.role === 'stop')
    .map((e) => ({
      name: e.code || e.name || null,
      time: e.local_time || null,
      at: e.local_time ? posOf(e.local_date || dep.date, e.local_time, null) : null,
    }));

  return {
    start,
    end,
    durationMin: durationKnown ? Math.round(durationMin!) : null,
    durationKnown,
    dep,
    arr,
    stops,
    crossesTimezones: !!(dep.tz && arr.tz && dep.tz !== arr.tz),
  };
}
