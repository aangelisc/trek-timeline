// The contract between the server routes and the page: the timeline model, warnings,
// operations and the response envelopes. Positions on the timeline are in days from
// the start of day 0 (1.5 = day 1 at noon).

export type Level = 'error' | 'warning' | 'info';

export interface Category {
  name: string | null;
  color: string | null;
}

export interface PlaceItem {
  kind: 'place';
  /** The assignment id (negative while an optimistic add is pending). */
  id: number;
  placeId: number;
  title: string;
  time: string | null;
  category: Category | null;
  order: number;
  pending?: boolean;
}

export interface NoteItem {
  kind: 'note';
  id: number;
  title: string;
  time: string | null;
  color: string | null;
  order: number;
  pending?: boolean;
}

export interface BookingItem {
  kind: 'booking';
  id: number;
  title: string;
  type: string | null;
  date: string | null;
  time: string | null;
  status: string | null;
  order: number;
  pending?: boolean;
}

export type DayItem = PlaceItem | NoteItem | BookingItem;
export type ItemKind = DayItem['kind'];

export interface ModelDay {
  id: number;
  index: number;
  number: number;
  date: string | null;
  title: string | null;
  items: DayItem[];
  cost: number;
}

export interface Stay {
  id: number;
  placeId: number | null;
  title: string;
  address: string | null;
  /** The check-in day. */
  startDayId: number;
  /** The check-out day: the stay covers the nights start … end−1. */
  endDayId: number;
  startIndex: number | null;
  endIndex: number | null;
  nights: number | null;
  checkIn: string | null;
  checkInEnd: string | null;
  checkOut: string | null;
  confirmation: string | null;
  notes: string | null;
  reservationId: number | null;
  status: string | null;
  cost: number;
}

export interface BookingSummary {
  id: number;
  kind: 'booking';
  type: string | null;
  title: string;
  status: string | null;
  confirmation: string | null;
  reservationTime: string | null;
  reservationEndTime: string | null;
  cost: number;
}

/** One end of a journey, in its own local time. */
export interface JourneyEnd {
  name: string | null;
  date: string | null;
  time: string | null;
  tz: string | null;
}

export interface Stop {
  name: string | null;
  time: string | null;
  at: number | null;
}

export interface Transport extends BookingSummary {
  dayId: number | null;
  endDayId: number | null;
  /** Local departure, as a timeline position. */
  start: number;
  /** Local arrival, as a timeline position. */
  end: number;
  /** Real time in transit (from the endpoint zones when both are known). */
  durationMin: number | null;
  durationKnown: boolean;
  dep: JourneyEnd;
  arr: JourneyEnd;
  stops: Stop[];
  crossesTimezones: boolean;
}

export interface UnscheduledPlace {
  kind: 'place';
  id: number;
  title: string;
}

export interface Costs {
  available: boolean;
  currency: string | null;
  total: number;
  unallocated: number;
  byCategory: { category: string; total: number }[];
}

export interface Model {
  trip: {
    id: number | null;
    title: string | null;
    startDate: string | null;
    endDate: string | null;
    currency: string | null;
    dated: boolean;
  };
  days: ModelDay[];
  stays: Stay[];
  transport: Transport[];
  unscheduled: { places: UnscheduledPlace[]; bookings: BookingSummary[] };
  costs: Costs;
}

export type WarningRule =
  'missing-stay' | 'stay-overlap' | 'late-arrival' | 'outside-trip' | 'date-mismatch' | 'empty-day';

export interface Warning {
  id: string;
  rule: WarningRule;
  level: Level;
  message: string;
  dayId?: number;
  dayIndex?: number;
  dayIds?: number[];
  stayIds?: number[];
  reservationIds?: number[];
}

/** Gestures that need plugin methods TREK doesn't expose yet. */
export interface Capabilities {
  reorderDays: boolean;
  moveItems: boolean;
  reorderItems: boolean;
  moveNotes: boolean;
}

// ---- operations -------------------------------------------------------------------

export type StayField = 'check_in' | 'check_in_end' | 'check_out' | 'confirmation' | 'notes';
export type BookingField = 'title' | 'status' | 'confirmation_number' | 'notes' | 'depTime' | 'arrTime';

export interface StayTimes {
  checkIn?: string | null;
  checkOut?: string | null;
  checkInEnd?: string | null;
}

export interface OperationArgs {
  reorderDays: { orderedIds: number[] };
  /** `toPosition` counts ALL items of the target day, with the dragged one taken out. */
  moveItem: {
    kind: ItemKind;
    id: number;
    toDayId: number;
    toPosition?: number;
  };
  assignPlace: { placeId: number; dayId: number };
  moveBooking: { reservationId: number; toDayId: number };
  shiftBooking: { reservationId: number; minutes: number };
  moveStay: {
    stayId: number;
    startDayId: number;
    endDayId: number;
  } & StayTimes;
  editStay: {
    stayId: number;
    fields: Partial<Record<StayField, string | null>>;
  };
  editBooking: {
    reservationId: number;
    fields: Partial<Record<BookingField, string | null>>;
  };
}

export type OperationName = keyof OperationArgs;

export interface OperationRequest<K extends OperationName = OperationName> {
  tripId: number | string;
  op: K;
  args: OperationArgs[K];
  /** Return the impact without writing. */
  dryRun?: boolean;
}

export interface Impact {
  destructive: boolean;
  summary: string[];
  noop: boolean;
}

// ---- responses --------------------------------------------------------------------

export interface TimelinePayload {
  model: Model;
  warnings: Warning[];
  capabilities: Capabilities;
}

/**
 * A handled failure. It travels as HTTP 200 because TREK's bridge rejects a non-2xx
 * invoke with only the status code, and the reason would never reach the page.
 */
export interface Failure {
  ok: false;
  status: number;
  error: string;
  /** The host refused a write: the user can view the trip but not edit it. */
  readOnly?: boolean;
}

export type TimelineResponse = ({ ok: true } & TimelinePayload) | Failure;
export type DryRunResponse = { ok: true; impact: Impact } | Failure;
export type OpResponse = ({ ok: true; impact: Impact } & TimelinePayload) | Failure;
