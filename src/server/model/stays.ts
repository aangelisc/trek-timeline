import type { Stay } from '../../shared/types.ts';
import type { RawAccommodation, RawReservation } from '../trek.ts';
import type { Lookup } from './lookup.ts';

/** The hotel booking TREK creates for every stay, which the stay bar already shows. */
export function isStayBooking(r: RawReservation): boolean {
  return r.accommodation_id != null && String(r.type || '').toLowerCase() === 'hotel';
}

/** Stays in check-in order, each with the hotel booking TREK made for it. */
export function buildStays(
  accommodations: RawAccommodation[],
  reservations: RawReservation[],
  lookup: Lookup,
  costByReservation: Map<number, number>,
): Stay[] {
  const { dayIndex } = lookup;
  const stayBooking = new Map<number, RawReservation>();
  for (const r of reservations) if (isStayBooking(r)) stayBooking.set(Number(r.accommodation_id), r);

  return accommodations
    .map((a) => {
      const startIndex = dayIndex.get(a.start_day_id);
      const endIndex = dayIndex.get(a.end_day_id);
      const booking = stayBooking.get(a.id) || null;
      return {
        id: a.id,
        placeId: a.place_id ?? null,
        title: a.place_name || a.reservation_title || (booking && booking.title) || 'Stay',
        address: a.place_address || null,
        startDayId: a.start_day_id,
        endDayId: a.end_day_id,
        startIndex: startIndex ?? null,
        endIndex: endIndex ?? null,
        nights: startIndex != null && endIndex != null ? endIndex - startIndex : null,
        checkIn: a.check_in || null,
        checkInEnd: a.check_in_end || null,
        checkOut: a.check_out || null,
        confirmation: a.confirmation || (booking && booking.confirmation_number) || null,
        notes: a.notes || null,
        reservationId: booking ? booking.id : null,
        status: booking ? (booking.status ?? null) : null,
        cost: booking ? costByReservation.get(booking.id) || 0 : 0,
      };
    })
    .sort((a, b) => (a.startIndex ?? 1e9) - (b.startIndex ?? 1e9));
}
