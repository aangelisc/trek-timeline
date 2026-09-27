import type { TripWarning } from 'trek-plugin-sdk';
import type { Level, Model, Warning } from '../shared/types.ts';
import { datePart, minutesOf } from './time.ts';

const LEVEL_RANK: Record<Level, number> = { error: 0, warning: 1, info: 2 };

export interface WarningOptions {
  /** Flag nights with nowhere to sleep (default true). */
  missingStays?: boolean;
  /** Flag days with nothing planned, as info (default true). */
  emptyDays?: boolean;
}

/**
 * Conflicts and gaps in a timeline model. Every rule is a pure function of the
 * model, so each can be tested on its own.
 */
export function computeWarnings(model: Model, opts: WarningOptions = {}): Warning[] {
  const options = { missingStays: true, emptyDays: true, ...opts };
  const warnings = [
    ...(options.missingStays ? missingStays(model) : []),
    ...overlappingStays(model),
    ...lateArrivals(model),
    ...bookingsOutsideTrip(model),
    ...dayDateMismatches(model),
    ...(options.emptyDays ? emptyDays(model) : []),
  ];
  return warnings.sort(
    (a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || (a.dayIndex ?? 1e9) - (b.dayIndex ?? 1e9),
  );
}

function dayLabel(model: Model, i: number): string {
  const day = model.days[i];
  return day ? `Day ${day.number}${day.date ? ` (${day.date})` : ''}` : `Day ${i + 1}`;
}

/** Night i is spent between day i and day i+1. An overnight journey counts as a bed. */
function missingStays(model: Model): Warning[] {
  const n = model.days.length;
  if (n < 2) return [];
  const covered = (night: number) =>
    model.stays.some(
      (s) => s.startIndex != null && s.endIndex != null && s.startIndex <= night && night < s.endIndex,
    ) || model.transport.some((t) => t.start < night + 1 && t.end > night + 1);
  const warnings: Warning[] = [];
  let runStart: number | null = null;
  for (let night = 0; night <= n - 1; night++) {
    const gap = night < n - 1 && !covered(night);
    if (gap && runStart == null) runStart = night;
    if (!gap && runStart != null) {
      const last = night - 1;
      const nights = last - runStart + 1;
      warnings.push({
        id: `missing-stay:${model.days[runStart].id}`,
        rule: 'missing-stay',
        level: 'warning',
        dayId: model.days[runStart].id,
        dayIndex: runStart,
        dayIds: model.days.slice(runStart, last + 1).map((d) => d.id),
        message:
          nights === 1
            ? `No accommodation for the night of ${dayLabel(model, runStart)}.`
            : `No accommodation for ${nights} nights, ${dayLabel(model, runStart)} to ${dayLabel(model, last)}.`,
      });
      runStart = null;
    }
  }
  return warnings;
}

function overlappingStays(model: Model): Warning[] {
  const stays = model.stays.flatMap((x) =>
    x.startIndex != null && x.endIndex != null ? [{ ...x, startIndex: x.startIndex, endIndex: x.endIndex }] : [],
  );
  const warnings: Warning[] = [];
  for (let i = 0; i < stays.length; i++) {
    for (let j = i + 1; j < stays.length; j++) {
      const from = Math.max(stays[i].startIndex, stays[j].startIndex);
      const to = Math.min(stays[i].endIndex, stays[j].endIndex);
      if (from < to) {
        const nights = to - from;
        warnings.push({
          id: `stay-overlap:${stays[i].id}:${stays[j].id}`,
          rule: 'stay-overlap',
          level: 'error',
          dayId: model.days[from].id,
          dayIndex: from,
          stayIds: [stays[i].id, stays[j].id],
          message: `${stays[i].title} and ${stays[j].title} overlap for ${nights} night${nights === 1 ? '' : 's'} from ${dayLabel(model, from)}.`,
        });
      }
    }
  }
  return warnings;
}

/** Arriving after a stay's check-in window has closed, on its check-in day. */
function lateArrivals(model: Model): Warning[] {
  const warnings: Warning[] = [];
  for (const stay of model.stays) {
    const close = minutesOf(stay.checkInEnd);
    if (close == null || stay.startIndex == null) continue;
    for (const t of model.transport) {
      if (!t.durationKnown || Math.floor(t.end) !== stay.startIndex) continue;
      const arrival = minutesOf(t.arr.time);
      if (arrival == null || arrival <= close) continue;
      warnings.push({
        id: `late-arrival:${t.id}:${stay.id}`,
        rule: 'late-arrival',
        level: 'warning',
        dayId: stay.startDayId,
        dayIndex: stay.startIndex,
        stayIds: [stay.id],
        reservationIds: [t.id],
        message: `${t.title} arrives at ${t.arr.time}, after check-in at ${stay.title} closes (${stay.checkInEnd}).`,
      });
    }
  }
  return warnings;
}

function tripRange(model: Model): { first: string; last: string } | null {
  const dates = model.days.flatMap((d) => (d.date ? [d.date] : [])).sort();
  return dates.length ? { first: dates[0], last: dates[dates.length - 1] } : null;
}

function bookingsOutsideTrip(model: Model): Warning[] {
  const range = tripRange(model);
  if (!range) return [];
  return model.unscheduled.bookings.flatMap((b): Warning[] => {
    const date = datePart(b.reservationTime);
    if (!date || (date >= range.first && date <= range.last)) return [];
    return [
      {
        id: `outside-trip:${b.id}`,
        rule: 'outside-trip',
        level: 'warning',
        reservationIds: [b.id],
        message: `${b.title} is dated ${date}, outside the trip (${range.first} to ${range.last}).`,
      },
    ];
  });
}

/** A booking pinned to a day whose date disagrees with the booking's own date. */
function dayDateMismatches(model: Model): Warning[] {
  const warnings: Warning[] = [];
  const byId = new Map(model.days.map((d) => [d.id, d]));
  const check = (id: number, title: string, dayId: number, date: string | null) => {
    const day = byId.get(dayId);
    if (!day || !day.date || !date || day.date === date) return;
    warnings.push({
      id: `date-mismatch:${id}`,
      rule: 'date-mismatch',
      level: 'warning',
      dayId,
      dayIndex: day.index,
      reservationIds: [id],
      message: `${title} is on Day ${day.number} (${day.date}) but the booking says ${date}.`,
    });
  };
  for (const d of model.days) {
    for (const it of d.items) if (it.kind === 'booking') check(it.id, it.title, d.id, it.date);
  }
  for (const t of model.transport) if (t.dayId != null) check(t.id, t.title, t.dayId, t.dep.date);
  return warnings;
}

function emptyDays(model: Model): Warning[] {
  const busy = new Set<number>();
  for (const t of model.transport) {
    for (let i = Math.floor(t.start); i <= Math.floor(Math.max(t.start, t.end - 1e-9)); i++) busy.add(i);
  }
  return model.days
    .filter((d) => d.items.length === 0 && !busy.has(d.index))
    .map((d) => ({
      id: `empty-day:${d.id}`,
      rule: 'empty-day',
      level: 'info',
      dayId: d.id,
      dayIndex: d.index,
      message: `Nothing planned on ${dayLabel(model, d.index)}.`,
    }));
}

/** TREK's own warning list: at most 20, most severe first, messages ≤ 300 chars. */
export function toTripWarnings(warnings: Warning[]): TripWarning[] {
  return warnings.slice(0, 20).map((w) => ({
    level: w.level,
    message: w.message.slice(0, 300),
    ...(w.dayId != null ? { dayId: w.dayId } : {}),
  }));
}
