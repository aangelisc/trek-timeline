import type { Model } from '../shared/types.ts';
import { buildModel } from './model/index.ts';
import { OpError } from './operations/errors.ts';
import type {
  RawAccommodation,
  RawCost,
  RawDay,
  RawPlace,
  RawReservation,
  RawTrek,
  RawTrip,
  TimelineCtx,
} from './trek.ts';
import type { WarningOptions } from './warnings.ts';

export interface Snapshot {
  raw: RawTrek;
  model: Model;
}

// The SDK types these rows loosely; trek.ts spells out the fields TREK returns.
const rows = <T>(v: unknown): T[] => (v || []) as T[];

/** Everything the timeline reads, in one parallel round of ctx calls. */
export async function loadTrip(ctx: TimelineCtx, tripId: number): Promise<Snapshot> {
  const [trip, days, reservations, accommodations, places, costs] = await Promise.all([
    ctx.trips.getById(tripId),
    ctx.trips.getDays(tripId),
    ctx.trips.getReservations(tripId),
    ctx.trips.getAccommodations(tripId),
    ctx.trips.getPlaces(tripId),
    // The Costs addon can be off, or the grant missing: the timeline still works.
    ctx.costs.getByTrip(tripId).catch((): null => null),
  ]);
  if (!trip) throw new OpError(`no trip ${tripId}`, 404);
  const raw: RawTrek = {
    trip: trip as RawTrip,
    days: rows<RawDay>(days),
    reservations: rows<RawReservation>(reservations),
    accommodations: rows<RawAccommodation>(accommodations),
    places: rows<RawPlace>(places),
    costs: rows<RawCost>(costs),
    costsAvailable: costs != null,
  };
  return { raw, model: buildModel(raw) };
}

/** The acting user's warning preferences; defaults when unset or userless. */
export async function warningOptions(ctx: TimelineCtx): Promise<Required<WarningOptions>> {
  const read = async (key: string) => {
    try {
      const v = await ctx.settings.get(key);
      return v === undefined || v === null ? true : v === true || v === 'true';
    } catch {
      return true;
    }
  };
  return {
    missingStays: await read('warn_missing_stays'),
    emptyDays: await read('warn_empty_days'),
  };
}
