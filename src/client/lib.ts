// Pure helpers for the page, kept free of the DOM so the node tests can import them.
import type { DayItem, ItemKind, Level, Model, Stay, StayTimes, Warning } from '../shared/types.ts';

/** A span on the timeline, in days: [start, end]. */
export type Span = [number, number];
/** Which edge of a stay a drag holds: its check-in, its check-out, or the whole bar. */
export type Handle = 'start' | 'end' | null;

const LEVEL_RANK: Record<Level, number> = { error: 0, warning: 1, info: 2 };
const EPS = 1e-9;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function minutesOf(hhmm: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || '');
  return m ? +m[1] * 60 + +m[2] : null;
}

/**
 * Greedy interval packing: returns, per item (in input order), the lowest row where
 * it doesn't overlap an earlier item. `gap` keeps touching bars on separate rows
 * readable.
 */
export function packLanes<T>(
  items: T[],
  startOf: (item: T) => number,
  endOf: (item: T) => number,
  gap = 0.02,
): number[] {
  const order = items.map((_, i) => i).sort((a, b) => startOf(items[a]) - startOf(items[b]));
  const rowEnds: number[] = [];
  const rows = new Array<number>(items.length);
  for (const i of order) {
    const s = startOf(items[i]);
    let r = 0;
    while (r < rowEnds.length && rowEnds[r] > s - gap) r++;
    rowEnds[r] = endOf(items[i]);
    rows[i] = r;
  }
  return rows;
}

/** Insertion index for a pointer at `y` among cards whose vertical midpoints are `mids`. */
export function insertionIndex(mids: number[], y: number): number {
  let n = 0;
  for (const mid of mids) if (mid < y) n++;
  return n;
}

/** Day column under an x offset into the day area (can be outside the trip). */
export function dayAt(x: number, dayWidth: number, count: number): number {
  return clamp(Math.floor(x / dayWidth), 0, count - 1);
}

/** Where a dragged day header lands: the gap between columns nearest the pointer. */
export function gapAt(x: number, dayWidth: number, count: number): number {
  return clamp(Math.round(x / dayWidth), 0, count);
}

export function moveInArray<T>(arr: T[], from: number, to: number): T[] {
  const out = arr.slice();
  const [item] = out.splice(from, 1);
  out.splice(to > from ? to - 1 : to, 0, item);
  return out;
}

/** A stay bar runs from its check-in time to its check-out time (defaults 15:00 / 11:00). */
export function staySpan(stay: Pick<Stay, 'startIndex' | 'endIndex' | 'checkIn' | 'checkOut'>): Span {
  const inMin = minutesOf(stay.checkIn);
  const outMin = minutesOf(stay.checkOut);
  return [
    (stay.startIndex ?? 0) + (inMin == null ? 900 : inMin) / 1440,
    (stay.endIndex ?? 0) + (outMin == null ? 660 : outMin) / 1440,
  ];
}

export function fmtHM(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return (m < 600 ? '0' : '') + Math.floor(m / 60) + ':' + (m % 60 < 10 ? '0' : '') + (m % 60);
}

/** Round a timeline position (in days) to the nearest `snapMin` minutes. */
export function snapPos(pos: number, snapMin: number): number {
  const u = snapMin / 1440;
  return Math.round(pos / u) * u;
}

/** A timeline position as a day index and a local time of day. */
export function posToDayTime(pos: number): {
  index: number;
  time: string;
  minutes: number;
} {
  const mins = Math.round(pos * 1440);
  return {
    index: Math.floor(mins / 1440),
    time: fmtHM(mins),
    minutes: ((mins % 1440) + 1440) % 1440,
  };
}

function frac(p: number): number {
  return p - Math.floor(p + EPS);
}

/**
 * A stay's span after dragging by `delta` days. `handle` is 'start', 'end' or null
 * (the whole bar). With `snapMin` the dragged edges land on that grid; without it
 * the drag moves whole days and each edge keeps its time. Either way the stay keeps
 * at least one night and stays inside the trip.
 */
export function dragStay(span: Span, handle: Handle, delta: number, dayCount: number, snapMin: number | null): Span {
  const s = span[0];
  const e = span[1];
  const sDay = Math.floor(s + EPS);
  const eDay = Math.floor(e + EPS);
  if (!snapMin) {
    let d = Math.round(delta);
    if (handle === 'start') return [clamp(sDay + d, 0, eDay - 1) + frac(s), e];
    if (handle === 'end') return [s, clamp(eDay + d, sDay + 1, dayCount - 1) + frac(e)];
    d = clamp(d, -sDay, dayCount - 1 - eDay);
    return [s + d, e + d];
  }
  const step = snapMin / 1440;
  const last = dayCount - step;
  if (handle === 'start') return [clamp(snapPos(s + delta, snapMin), 0, eDay - step), e];
  if (handle === 'end') return [s, clamp(snapPos(e + delta, snapMin), sDay + 1, last)];
  const shift = clamp(snapPos(s + delta, snapMin) - s, -s, last - e);
  return [s + shift, e + shift];
}

/**
 * Minutes to shift a transport bar that starts at `start` after dragging `delta`
 * days: onto the `snapMin` grid, or by whole days without it. Keeps it in the trip.
 */
export function dragTransport(start: number, delta: number, dayCount: number, snapMin: number | null): number {
  const next = !snapMin
    ? clamp(Math.floor(start + EPS) + Math.round(delta), 0, dayCount - 1) + frac(start)
    : clamp(snapPos(start + delta, snapMin), 0, dayCount - snapMin / 1440);
  return Math.round((next - start) * 1440);
}

export function fmtDuration(min: number | null): string {
  if (min == null) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? h + 'h' + (m ? ' ' + m + 'm' : '') : m + 'm';
}

function worse(a: Level | undefined, b: Level): Level {
  if (!a) return b;
  return LEVEL_RANK[a] <= LEVEL_RANK[b] ? a : b;
}

export interface WarningIndex {
  day: Record<number, Level>;
  stay: Record<number, Level>;
  booking: Record<number, Level>;
}

/** Worst warning level per day, stay and booking, for markers on the timeline. */
export function warningIndex(warnings: Warning[] | null | undefined): WarningIndex {
  const idx: WarningIndex = { day: {}, stay: {}, booking: {} };
  for (const w of warnings || []) {
    for (const id of w.dayIds || (w.dayId != null ? [w.dayId] : [])) idx.day[id] = worse(idx.day[id], w.level);
    for (const id of w.stayIds || []) idx.stay[id] = worse(idx.stay[id], w.level);
    for (const id of w.reservationIds || []) idx.booking[id] = worse(idx.booking[id], w.level);
  }
  return idx;
}

// ---- optimistic model updates (mirror what the server will do) ----------------

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function renumberDays(model: Model): void {
  model.days.forEach((d, i) => {
    d.index = i;
    d.number = i + 1;
  });
}

function reorderDays(model: Model, orderedIds: number[]): Model {
  const m = clone(model);
  const dates = m.days.flatMap((d) => (d.date ? [d.date] : [])).sort();
  const byId = new Map(m.days.map((d) => [d.id, d]));
  m.days = orderedIds.map((id, i) => {
    const d = byId.get(id)!;
    if (m.trip.dated) d.date = dates[i] || null;
    return d;
  });
  renumberDays(m);
  const pos = new Map(m.days.map((d, i) => [d.id, i]));
  for (const s of m.stays) {
    const a = pos.get(s.startDayId);
    const b = pos.get(s.endDayId);
    if (a == null || b == null) continue;
    s.startIndex = a;
    s.endIndex = b;
    s.nights = b - a;
  }
  for (const t of m.transport) {
    const p = t.dayId == null ? undefined : pos.get(t.dayId);
    if (p == null) continue;
    const shift = p - Math.floor(t.start);
    t.start += shift;
    t.end += shift;
  }
  return m;
}

function moveItem(model: Model, kind: ItemKind, id: number, toDayId: number, toPosition?: number): Model {
  const m = clone(model);
  let item: DayItem | null = null;
  for (const d of m.days) {
    const i = d.items.findIndex((it) => it.kind === kind && it.id === id);
    if (i >= 0) item = d.items.splice(i, 1)[0];
  }
  const to = m.days.find((d) => d.id === toDayId);
  if (!item || !to) return model;
  to.items.splice(clamp(toPosition == null ? to.items.length : toPosition, 0, to.items.length), 0, item);
  return m;
}

function moveStay(model: Model, stayId: number, startDayId: number, endDayId: number, times?: StayTimes): Model {
  const m = clone(model);
  const s = m.stays.find((x) => x.id === stayId);
  const a = m.days.find((d) => d.id === startDayId);
  const b = m.days.find((d) => d.id === endDayId);
  if (!s || !a || !b) return model;
  s.startDayId = a.id;
  s.endDayId = b.id;
  s.startIndex = a.index;
  s.endIndex = b.index;
  s.nights = b.index - a.index;
  if (times) {
    if (times.checkIn !== undefined) s.checkIn = times.checkIn;
    if (times.checkOut !== undefined) s.checkOut = times.checkOut;
    if (times.checkInEnd !== undefined) s.checkInEnd = times.checkInEnd;
  }
  return m;
}

function shiftTransport(model: Model, reservationId: number, minutes: number): Model {
  const m = clone(model);
  const t = m.transport.find((x) => x.id === reservationId);
  if (!t) return model;
  t.start += minutes / 1440;
  t.end += minutes / 1440;
  const shift = (hhmm: string | null) => {
    const v = minutesOf(hhmm);
    return v == null ? hhmm : fmtHM(v + minutes);
  };
  t.dep = { ...t.dep, time: shift(t.dep.time) };
  t.arr = { ...t.arr, time: shift(t.arr.time) };
  const day = m.days[Math.floor(t.start + EPS)];
  if (day) t.dayId = day.id;
  return m;
}

function moveTransport(model: Model, reservationId: number, toDayId: number): Model {
  const m = clone(model);
  const t = m.transport.find((x) => x.id === reservationId);
  const to = m.days.find((d) => d.id === toDayId);
  if (!t || !to) return model;
  const shift = to.index - Math.floor(t.start);
  t.start += shift;
  t.end += shift;
  t.dayId = to.id;
  return m;
}

/** Show a tray entry on its new day at once, as a pending card, until TREK answers. */
function scheduleFromTray(model: Model, kind: 'place' | 'booking', id: number, dayId: number): Model {
  const m = clone(model);
  const list: { id: number; title: string }[] = kind === 'place' ? m.unscheduled.places : m.unscheduled.bookings;
  const i = list.findIndex((x) => x.id === id);
  const day = m.days.find((d) => d.id === dayId);
  if (i < 0 || !day) return model;
  const [entry] = list.splice(i, 1);
  const base = {
    title: entry.title,
    time: null as string | null,
    order: 1e6,
    pending: true,
  };
  day.items.push(
    kind === 'place'
      ? { ...base, kind, id: -id, placeId: id, category: null }
      : { ...base, kind, id, type: null, date: null, status: null },
  );
  return m;
}

export const optimistic = {
  reorderDays,
  moveItem,
  moveStay,
  moveTransport,
  shiftTransport,
  scheduleFromTray,
};
