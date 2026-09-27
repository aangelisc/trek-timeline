import { minutesOf } from '../time.ts';
import type { RawDay } from '../trek.ts';

/** Timeline position (in days) of a local date + time; null when it can't be placed. */
export type PosOf = (
  date: string | null | undefined,
  hhmm: string | null | undefined,
  dayId: number | null | undefined,
) => number | null;

/** The trip's days in TREK order, and the ways to find one. */
export interface Lookup {
  days: RawDay[];
  /** Day id → index. */
  dayIndex: Map<number, number>;
  dayOnDate(date: string | null): RawDay | undefined;
  posOf: PosOf;
}

export function buildLookup(rawDays: RawDay[]): Lookup {
  const days = rawDays.slice().sort((a, b) => (a.day_number ?? 0) - (b.day_number ?? 0));
  const dayIndex = new Map(days.map((d, i) => [d.id, i]));
  const indexByDate = new Map<string, number>();
  days.forEach((d, i) => {
    if (d.date && !indexByDate.has(d.date)) indexByDate.set(d.date, i);
  });
  const dayOnDate = (date: string | null): RawDay | undefined => {
    const i = date == null ? undefined : indexByDate.get(date);
    return i === undefined ? undefined : days[i];
  };
  const posOf: PosOf = (date, hhmm, dayId) => {
    let idx = date != null ? indexByDate.get(date) : undefined;
    if (idx === undefined && dayId != null) idx = dayIndex.get(dayId);
    if (idx === undefined) return null;
    return idx + (minutesOf(hhmm) ?? 0) / 1440;
  };
  return { days, dayIndex, dayOnDate, posOf };
}
