// What the plugin reads from and calls on TREK. The SDK types most rows loosely
// (`[k: string]: unknown`), so the fields the timeline depends on are spelled out here,
// as verified against the TREK 4.3 source. They are type aliases, not
// interfaces, so they stay assignable to the SDK's indexable row types.

import type { PluginContext } from 'trek-plugin-sdk';

export type RawTrip = {
  id: number;
  title?: string;
  name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  currency?: string | null;
};

export type RawCategory = {
  name?: string | null;
  color?: string | null;
  icon?: string | null;
};

export type RawPlace = {
  id: number;
  trip_id?: number;
  name?: string;
  lat?: number | null;
  lng?: number | null;
  category_id?: number | null;
  category?: RawCategory | null;
  place_time?: string | null;
};

/** An assignment of a place to a day. The place is nested; older payloads were flat. */
export type RawAssignment = {
  id: number;
  day_id?: number;
  place_id?: number | null;
  order_index?: number | null;
  notes?: string | null;
  place_time?: string | null;
  place?: RawPlace | null;
  place_name?: string | null;
  category_name?: string | null;
  category_color?: string | null;
  category_icon?: string | null;
  /** Flat payloads carry the place's own fields on the assignment. */
  name?: string | null;
  category?: RawCategory | null;
};

export type RawDayNote = {
  id: number;
  day_id?: number;
  text?: string | null;
  time?: string | null;
  icon?: string | null;
  color?: string | null;
  sort_order?: number | null;
};

export type RawDay = {
  id: number;
  trip_id?: number;
  day_number?: number | null;
  date?: string | null;
  title?: string | null;
  notes?: string | null;
  assignments?: RawAssignment[];
  notes_items?: RawDayNote[];
};

export type EndpointRole = 'from' | 'to' | 'stop';

/** A journey leg end. Updating a booking's endpoints replaces all of them. */
export type RawEndpoint = {
  id?: number;
  reservation_id?: number;
  role: EndpointRole;
  sequence?: number | null;
  code?: string | null;
  name?: string | null;
  lat?: number | null;
  lng?: number | null;
  timezone?: string | null;
  local_date?: string | null;
  local_time?: string | null;
};

export type RawReservation = {
  id: number;
  trip_id?: number;
  type?: string;
  title?: string | null;
  status?: string | null;
  confirmation_number?: string | null;
  day_id?: number | null;
  end_day_id?: number | null;
  /** Naive local 'YYYY-MM-DDTHH:mm'. */
  reservation_time?: string | null;
  reservation_end_time?: string | null;
  endpoints?: RawEndpoint[];
  /** Position on each day's shared ordering scale, keyed by day id. */
  day_positions?: Record<string, number> | null;
  day_plan_position?: number | null;
  /** Set on the hotel booking TREK creates for every stay. */
  accommodation_id?: number | null;
};

export type RawAccommodation = {
  id: number;
  trip_id?: number;
  place_id?: number | null;
  start_day_id: number;
  /** The check-out day. */
  end_day_id: number;
  check_in?: string | null;
  check_in_end?: string | null;
  check_out?: string | null;
  confirmation?: string | null;
  notes?: string | null;
  place_name?: string | null;
  place_address?: string | null;
  reservation_title?: string | null;
};

export type RawCost = {
  id: number;
  trip_id?: number;
  name?: string;
  category?: string | null;
  total_price?: number | null;
  currency?: string | null;
  /** Taken as item currency → trip currency, frozen at entry. */
  exchange_rate?: number | null;
  reservation_id?: number | null;
  place_id?: number | null;
  expense_date?: string | null;
};

/** Everything the timeline reads, as TREK returns it. */
export type RawTrek = {
  trip: RawTrip;
  days: RawDay[];
  reservations: RawReservation[];
  accommodations: RawAccommodation[];
  places: RawPlace[];
  costs: RawCost[];
  /** False when the Costs addon is off or the grant is missing. */
  costsAvailable?: boolean;
};

type Ctx = PluginContext;

/**
 * The part of `ctx` this plugin uses, plus the methods proposed upstream (docs/PLAN.md,
 * Phase 1) as optional: the plugin checks for them at runtime. The real PluginContext
 * satisfies it, and so must the in-memory TREK the tests and sandbox use.
 */
export interface TimelineCtx {
  trips: Pick<Ctx['trips'], 'getById' | 'getDays' | 'getReservations' | 'getAccommodations' | 'getPlaces'>;
  costs: Pick<Ctx['costs'], 'getByTrip'>;
  settings: Ctx['settings'];
  log: Ctx['log'];
  accommodations: Pick<Ctx['accommodations'], 'update'>;
  reservations: Pick<Ctx['reservations'], 'update'>;
  itinerary: Pick<Ctx['itinerary'], 'assign' | 'unassign'> & {
    move?(tripId: number, assignmentId: number, newDayId: number, orderIndex: number): Promise<unknown>;
    reorder?(tripId: number, dayId: number, orderedAssignmentIds: number[]): Promise<unknown>;
  };
  daynotes: Pick<Ctx['daynotes'], 'update'> & {
    move?(tripId: number, noteId: number, fromDayId: number, toDayId: number, sortOrder: number): Promise<unknown>;
  };
  // Nothing on days is used yet; Partial keeps the SDK's `days` assignable here.
  days: Partial<Ctx['days']> & {
    reorder?(tripId: number, orderedDayIds: number[]): Promise<unknown>;
  };
}
