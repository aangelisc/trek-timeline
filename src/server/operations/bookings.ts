import type { OperationArgs } from '../../shared/types.ts';
import { isTransport } from '../model/transport.ts';
import { addDays, datePart, dayDelta, shiftLocal, timePart, withDatePart, withTimePart } from '../time.ts';
import { fail } from './errors.ts';
import { bookingById, cleanText, cleanTime, dayById, endpointInput, fmtMinutes, label } from './helpers.ts';
import type { EndpointInput, Input, PlanInput, PlanPart } from './types.ts';

/** Move a booking to another day, shifting its dates and transport legs with it. */
export function moveBooking(
  { model, tripId, raw }: PlanInput,
  { reservationId, toDayId }: OperationArgs['moveBooking'],
): PlanPart {
  const r = bookingById(raw, reservationId);
  const to = dayById(model, toDayId);
  const fromDay = r.day_id != null ? model.days.find((d) => d.id === r.day_id) : null;
  if (fromDay && fromDay.id === to.id) return { calls: [], summary: ['Nothing changes.'] };

  const input: Input = { day_id: to.id };
  const oldDate = datePart(r.reservation_time);
  const shift = oldDate && to.date ? dayDelta(oldDate, to.date) : null;

  if (to.date) input.reservation_time = r.reservation_time ? withDatePart(r.reservation_time, to.date) : to.date;
  if (r.reservation_end_time && shift) {
    input.reservation_end_time = withDatePart(r.reservation_end_time, addDays(datePart(r.reservation_end_time), shift));
  }
  if (r.end_day_id != null && fromDay) {
    const endDay = model.days.find((d) => d.id === r.end_day_id);
    if (endDay) {
      const next = model.days[endDay.index + (to.index - fromDay.index)];
      if (!next) fail(`${r.title} would end after the last day of the trip.`, 409);
      input.end_day_id = next.id;
    }
  }
  const eps = r.endpoints || [];
  if (eps.length && shift) {
    input.endpoints = eps.map((e) =>
      endpointInput(e, {
        local_date: e.local_date ? addDays(e.local_date, shift) : null,
      }),
    );
  }

  const summary = [`Moves ${r.title} from ${fromDay ? label(fromDay) : 'unscheduled'} to ${label(to)}.`];
  if (shift) summary.push(`Its dates shift by ${shift > 0 ? '+' : ''}${shift} day${Math.abs(shift) === 1 ? '' : 's'}.`);
  const real = isTransport(r) || !!r.confirmation_number;
  if (real) summary.push('Only TREK changes. The booking with the provider does not.');

  return {
    destructive: real && shift !== 0,
    summary,
    calls: [{ method: 'reservations.update', args: [tripId, r.id, input] }],
  };
}

/**
 * Shift a booking by some minutes: departure, arrival and every leg move together, so
 * the time in transit is unchanged. Crossing midnight moves the dates and the days.
 */
export function shiftBooking(
  { model, tripId, raw }: PlanInput,
  { reservationId, minutes }: OperationArgs['shiftBooking'],
): PlanPart {
  const r = bookingById(raw, reservationId);
  const delta = Math.round(Number(minutes));
  if (!Number.isFinite(delta) || Math.abs(delta) > 1440 * 366)
    fail('minutes must be a number of minutes within a year');
  if (delta === 0) return { calls: [], summary: ['Nothing changes.'] };

  const input: Input = {};
  const shiftStamp = (dt: string) => {
    const out = shiftLocal(datePart(dt), timePart(dt), delta);
    return {
      value: out.date ? (out.time ? `${out.date}T${out.time}` : out.date) : dt,
      days: out.days,
    };
  };
  const eps = (r.endpoints || []).slice().sort((x, y) => (x.sequence ?? 0) - (y.sequence ?? 0));
  const from = eps.find((e) => e.role === 'from') || eps[0] || null;
  const to = [...eps].reverse().find((e) => e.role === 'to') || null;

  // How many days departure and arrival move: legs first, the naive times otherwise.
  let depDays = 0;
  let arrDays: number | null = null;
  let endpoints: EndpointInput[] | null = null;
  if (eps.length) {
    endpoints = eps.map((e) => {
      const out = shiftLocal(e.local_date, e.local_time, delta);
      if (e === from) depDays = out.days;
      if (e === to) arrDays = out.days;
      return endpointInput(e, { local_time: out.time, local_date: out.date });
    });
    input.endpoints = endpoints;
  }
  let newTime: string | null = null;
  if (r.reservation_time) {
    const s = shiftStamp(r.reservation_time);
    input.reservation_time = newTime = s.value;
    if (!eps.length) depDays = s.days;
  } else if (!eps.length) {
    depDays = Math.floor((720 + delta) / 1440);
  }
  if (r.reservation_end_time) {
    const s = shiftStamp(r.reservation_end_time);
    input.reservation_end_time = s.value;
    if (arrDays == null) arrDays = s.days;
  }
  const arrShift: number = arrDays ?? depDays;

  const moveDay = (dayId: number, days: number) => {
    const d = model.days.find((x) => x.id === dayId);
    if (!d) return undefined;
    const next = model.days[d.index + days];
    if (!next) fail(`${r.title} would move outside the trip.`, 409);
    return next.id;
  };
  if (r.day_id != null) input.day_id = moveDay(r.day_id, depDays);
  if (r.end_day_id != null) input.end_day_id = moveDay(r.end_day_id, arrShift);
  for (const k of Object.keys(input)) if (input[k] === undefined) delete input[k];

  const newDep = from && from.local_time && endpoints ? endpoints[eps.indexOf(from)].local_time : timePart(newTime);
  const oldDep = from && from.local_time ? from.local_time : timePart(r.reservation_time);
  const summary = [
    `Moves ${r.title} ${delta > 0 ? 'later' : 'earlier'} by ${fmtMinutes(Math.abs(delta))}${oldDep && newDep ? ` (departs ${newDep}, was ${oldDep})` : ''}.`,
  ];
  if (depDays)
    summary.push(
      `It now departs ${Math.abs(depDays)} day${Math.abs(depDays) === 1 ? '' : 's'} ${depDays > 0 ? 'later' : 'earlier'}.`,
    );
  const real = isTransport(r) || !!r.confirmation_number;
  if (real) summary.push('Only TREK changes. The booking with the provider does not.');
  return {
    destructive: real,
    summary,
    calls: [{ method: 'reservations.update', args: [tripId, r.id, input] }],
  };
}

export function editBooking(
  { tripId, raw }: PlanInput,
  { reservationId, fields }: OperationArgs['editBooking'],
): PlanPart {
  const r = bookingById(raw, reservationId);
  const f = fields || {};
  const input: Input = {};
  if ('title' in f) {
    const t = cleanText(f.title, 200);
    if (!t) fail('a booking needs a title');
    input.title = t;
  }
  if ('status' in f) input.status = cleanText(f.status, 40) || 'pending';
  if ('confirmation_number' in f) input.confirmation_number = cleanText(f.confirmation_number, 100);
  if ('notes' in f) input.notes = cleanText(f.notes, 2000);

  const eps = (r.endpoints || []).map((e) => ({ ...e }));
  let epsChanged = false;
  if ('depTime' in f) {
    const t = cleanTime(f.depTime);
    if (r.reservation_time && datePart(r.reservation_time))
      input.reservation_time = withTimePart(r.reservation_time, t);
    const from = eps.find((e) => e.role === 'from');
    if (from) {
      from.local_time = t;
      epsChanged = true;
    }
  }
  if ('arrTime' in f) {
    const t = cleanTime(f.arrTime);
    if (r.reservation_end_time && datePart(r.reservation_end_time))
      input.reservation_end_time = withTimePart(r.reservation_end_time, t);
    const to = [...eps].reverse().find((e) => e.role === 'to');
    if (to) {
      to.local_time = t;
      epsChanged = true;
    }
  }
  if (epsChanged) input.endpoints = eps.map((e) => endpointInput(e));
  if (!Object.keys(input).length) fail('nothing to change');
  return {
    summary: [`Updates ${r.title}.`],
    calls: [{ method: 'reservations.update', args: [tripId, r.id, input] }],
  };
}
