import type { OperationArgs, StayField } from '../../shared/types.ts';
import { fail } from './errors.ts';
import { cleanText, cleanTime, dayById, label } from './helpers.ts';
import type { Input, PlanInput, PlanPart } from './types.ts';

/**
 * Move or resize a stay. `endDayId` is the check-out day. `checkIn`, `checkOut` and
 * `checkInEnd` are optional new times, for drags that land between whole days.
 */
export function moveStay(
  { model, tripId }: PlanInput,
  { stayId, startDayId, endDayId, checkIn, checkOut, checkInEnd }: OperationArgs['moveStay'],
): PlanPart {
  const stay = model.stays.find((s) => s.id === Number(stayId));
  if (!stay) fail(`no stay ${stayId} on this trip`);
  const a = dayById(model, startDayId);
  const b = dayById(model, endDayId);
  if (b.index <= a.index) fail('A stay needs at least one night: check-out must be after check-in.');

  const input: Input = {};
  if (a.id !== stay.startDayId) input.start_day_id = a.id;
  if (b.id !== stay.endDayId) input.end_day_id = b.id;
  const times = [
    ['check_in', checkIn, stay.checkIn],
    ['check_out', checkOut, stay.checkOut],
    ['check_in_end', checkInEnd, stay.checkInEnd],
  ] as const;
  for (const [field, next, current] of times) {
    if (next === undefined) continue;
    const t = cleanTime(next);
    if (t !== (current || null)) input[field] = t;
  }
  if (!Object.keys(input).length) return { calls: [], summary: ['Nothing changes.'] };
  // TREK validates the day pair together, so always send both.
  input.start_day_id = a.id;
  input.end_day_id = b.id;

  const inTime = 'check_in' in input ? input.check_in : stay.checkIn;
  const outTime = 'check_out' in input ? input.check_out : stay.checkOut;
  const nights = b.index - a.index;
  const summary = [
    `${stay.title}: check in ${label(a)}${inTime ? ` at ${inTime}` : ''}, check out ${label(b)}${outTime ? ` at ${outTime}` : ''} (${nights} night${nights === 1 ? '' : 's'}).`,
  ];
  if (stay.nights != null && nights !== stay.nights)
    summary.push(`Was ${stay.nights} night${stay.nights === 1 ? '' : 's'}.`);
  for (const other of model.stays) {
    if (other.id === stay.id || other.startIndex == null || other.endIndex == null) continue;
    if (Math.max(a.index, other.startIndex) < Math.min(b.index, other.endIndex)) {
      summary.push(`Overlaps ${other.title}.`);
    }
  }
  if (stay.confirmation) summary.push('Only TREK changes. The booking with the hotel does not.');
  return {
    // Retiming within the same days is harmless; moving days on a booked stay is not.
    destructive: !!stay.confirmation && (a.id !== stay.startDayId || b.id !== stay.endDayId),
    summary,
    calls: [{ method: 'accommodations.update', args: [tripId, stay.id, input] }],
  };
}

const STAY_TIMES: StayField[] = ['check_in', 'check_in_end', 'check_out'];

export function editStay({ model, tripId }: PlanInput, { stayId, fields }: OperationArgs['editStay']): PlanPart {
  const stay = model.stays.find((s) => s.id === Number(stayId));
  if (!stay) fail(`no stay ${stayId} on this trip`);
  const f = fields || {};
  const input: Input = {};
  for (const k of STAY_TIMES) if (k in f) input[k] = cleanTime(f[k]);
  if ('confirmation' in f) input.confirmation = cleanText(f.confirmation, 100);
  if ('notes' in f) input.notes = cleanText(f.notes, 2000);
  if (!Object.keys(input).length) fail('nothing to change');
  return {
    summary: [`Updates ${stay.title}.`],
    calls: [{ method: 'accommodations.update', args: [tripId, stay.id, input] }],
  };
}
