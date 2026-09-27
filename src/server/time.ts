// Date helpers for TREK's naive local strings: dates are 'YYYY-MM-DD', booking
// times are 'YYYY-MM-DDTHH:mm' (no zone), endpoint times are 'HH:mm' + an IANA zone.

export const DAY_MS = 86400000;

type Maybe = string | null | undefined;

export function parseDate(s: Maybe): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof s === 'string' ? s : '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
}

export function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: Maybe, n: number): string | null {
  const ms = parseDate(date);
  return ms == null ? null : formatDate(ms + n * DAY_MS);
}

export function dayDelta(from: Maybe, to: Maybe): number | null {
  const a = parseDate(from);
  const b = parseDate(to);
  return a == null || b == null ? null : Math.round((b - a) / DAY_MS);
}

export function datePart(dt: Maybe): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(typeof dt === 'string' ? dt : '');
  return m ? m[1] : null;
}

export function timePart(dt: Maybe): string | null {
  const m = /[T ](\d{2}):(\d{2})/.exec(typeof dt === 'string' ? dt : '');
  return m ? `${m[1]}:${m[2]}` : null;
}

export function minutesOf(hhmm: Maybe): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(typeof hhmm === 'string' ? hhmm : '');
  return m ? +m[1] * 60 + +m[2] : null;
}

/** Swap the date of a naive datetime, keeping its time of day (TREK's withDatePart). */
export function withDatePart<T extends Maybe>(dt: T, date: Maybe): T | string {
  if (!date) return dt;
  if (typeof dt !== 'string' || dt.length <= 10) return date;
  return date + dt.slice(10);
}

/** Swap the time of a naive datetime, keeping its date. */
export function withTimePart<T extends Maybe>(dt: T, hhmm: Maybe): T | string {
  const date = datePart(dt);
  if (!date) return dt;
  return hhmm ? `${date}T${hhmm}` : date;
}

/** Offset of an IANA zone from UTC at an instant, in minutes; null for an unknown zone. */
export function tzOffset(timeZone: string, utcMs: number): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(utcMs));
    const p: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
    for (const x of parts) p[x.type] = x.value;
    const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour! % 24, +p.minute!, +p.second!);
    return Math.round((asUtc - utcMs) / 60000);
  } catch {
    return null;
  }
}

/** A local wall-clock time in a zone, as a UTC instant; null when any part is missing. */
export function localToUtc(date: Maybe, hhmm: Maybe, timeZone: Maybe): number | null {
  const base = parseDate(date);
  const mins = minutesOf(hhmm);
  if (base == null || mins == null || !timeZone) return null;
  const naive = base + mins * 60000;
  const off = tzOffset(timeZone, naive);
  if (off == null) return null;
  // One correction pass covers instants that sit across a DST switch from the guess.
  const off2 = tzOffset(timeZone, naive - off * 60000);
  return naive - (off2 ?? off) * 60000;
}

export function formatHM(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Shift a local date + time by some minutes, rolling the date over midnight.
 * `days` is how many calendar days it moved. A stamp with no time pivots on midday,
 * so nudging an all-day booking by a few hours keeps its date.
 */
export function shiftLocal(
  date: Maybe,
  hhmm: Maybe,
  minutes: number,
): { date: string | null; time: string | null; days: number } {
  const m = minutesOf(hhmm);
  const total = (m == null ? 720 : m) + minutes;
  const days = Math.floor(total / 1440);
  return {
    date: date ? addDays(date, days) : null,
    time: m == null ? null : formatHM(total),
    days,
  };
}
