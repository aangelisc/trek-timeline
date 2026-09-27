// The timeline model: TREK's rows turned into what the page draws. Positions on the
// timeline are in days from the start of day 0.
import type { Model } from '../../shared/types.ts';
import type { RawTrek, RawTrip } from '../trek.ts';
import { allocateCosts, costSummary, tallyCosts } from './costs.ts';
import { buildDays, unscheduledPlaces } from './days.ts';
import { buildLookup } from './lookup.ts';
import { buildStays } from './stays.ts';
import { placeBookings } from './transport.ts';

export { costInTripCurrency } from './costs.ts';
export { isStayBooking } from './stays.ts';
export { isTransport, TRANSPORT_TYPES } from './transport.ts';

export function buildModel(raw: RawTrek): Model {
  const trip: Partial<RawTrip> = raw.trip || {};
  const currency = trip.currency || null;
  const lookup = buildLookup(raw.days || []);
  const reservations = raw.reservations || [];
  const costs = raw.costs || [];

  const tally = tallyCosts(costs, currency);
  const stays = buildStays(raw.accommodations || [], reservations, lookup, tally.byReservation);
  const bookings = placeBookings(reservations, lookup, tally.byReservation);
  const plan = buildDays(lookup.days, bookings.byDay);
  const unallocated = allocateCosts(costs, currency, lookup, reservations, stays, plan.days);

  return {
    trip: {
      id: trip.id ?? null,
      title: trip.title ?? trip.name ?? null,
      startDate: trip.start_date ?? null,
      endDate: trip.end_date ?? null,
      currency,
      dated: lookup.days.some((d) => d.date),
    },
    days: plan.days,
    stays,
    transport: bookings.transport,
    unscheduled: {
      places: unscheduledPlaces(raw.places || [], plan.assignedPlaceIds, stays),
      bookings: bookings.unscheduled,
    },
    costs: costSummary(tally, unallocated, currency, raw.costsAvailable !== false),
  };
}
