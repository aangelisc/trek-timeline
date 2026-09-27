// Start, commit and end a drag, whether pointer or keyboard.
import type { ItemKind, OperationArgs } from '../../shared/types.ts';
import { flushQueuedRefresh, runOp } from '../data.ts';
import { announce } from '../dom.ts';
import * as L from '../lib.ts';
import type { Drag, DragBase } from '../state.ts';
import { S, model, rerender } from '../state.ts';
import { clearMarks, moveGhost, stopAutoScroll } from './paint.ts';
import { dayIndexOf, targetValid } from './targets.ts';

let suppressClickUntil = 0;

/** A drag just ended with a pointer: its mouseup shouldn't also count as a click. */
export function clicksSuppressed(): boolean {
  return Date.now() < suppressClickUntil;
}

export function beginDrag(el: HTMLElement, via: DragBase['via'], e?: PointerEvent): Drag | null {
  const m = model();
  const type = el.getAttribute('data-drag');
  const id = Number(el.getAttribute('data-id'));
  const base: DragBase = { el, id, via, ghost: null };
  let d: Drag;
  if (type === 'item') {
    const kind = el.getAttribute('data-kind') as ItemKind;
    const fromDayId = Number(el.getAttribute('data-day'));
    const dayIdx = dayIndexOf(fromDayId);
    const pos = Math.max(
      0,
      m.days[dayIdx].items.findIndex((it) => it.kind === kind && it.id === id),
    );
    d = { ...base, type, kind, fromDayId, target: { dayIdx, pos } };
  } else if (type === 'tray') {
    d = {
      ...base,
      type,
      kind: el.getAttribute('data-kind') as 'place' | 'booking',
      target: { dayIdx: 0, pos: 0 },
    };
  } else if (type === 'day') {
    const fromIdx = dayIndexOf(id);
    d = { ...base, type, fromIdx, target: { gap: fromIdx } };
  } else if (type === 'stay') {
    const stay = m.stays.find((s) => s.id === id);
    if (!stay) return null;
    const span0 = L.staySpan(stay);
    d = { ...base, type, stay, span0, target: { span: span0 } };
  } else if (type === 'transport') {
    const transport = m.transport.find((t) => t.id === id);
    if (!transport) return null;
    d = { ...base, type, transport, target: { minutes: 0 } };
  } else {
    return null;
  }
  el.classList.add(via === 'key' ? 'is-keymove' : 'is-dragging');
  if (e && via === 'pointer' && (d.type === 'item' || d.type === 'tray' || d.type === 'day')) {
    const r = el.getBoundingClientRect();
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.classList.remove('is-dragging');
    ghost.classList.add('ts-ghost');
    ghost.style.width = r.width + 'px';
    d.ghost = ghost;
    d.offX = e.clientX - r.left;
    d.offY = e.clientY - r.top;
    document.body.appendChild(ghost);
    moveGhost(d, e);
    document.body.classList.add('ts-grabbing');
  }
  S.drag = d;
  return d;
}

export function commit(d: Drag): void {
  const m = model();
  if (!targetValid(d)) return cancel();
  finish();
  if (d.type === 'item') {
    const toId = m.days[d.target.dayIdx].id;
    const pos = d.target.pos;
    runOp('moveItem', { kind: d.kind, id: d.id, toDayId: toId, toPosition: pos }, (mm) =>
      d.kind === 'booking'
        ? L.optimistic.moveItem(mm, d.kind, d.id, toId)
        : L.optimistic.moveItem(mm, d.kind, d.id, toId, pos),
    );
  } else if (d.type === 'tray') {
    const dayId = m.days[d.target.dayIdx].id;
    if (d.kind === 'place')
      runOp('assignPlace', { placeId: d.id, dayId }, (mm) => L.optimistic.scheduleFromTray(mm, 'place', d.id, dayId));
    else
      runOp('moveBooking', { reservationId: d.id, toDayId: dayId }, (mm) =>
        L.optimistic.scheduleFromTray(mm, 'booking', d.id, dayId),
      );
  } else if (d.type === 'day') {
    const ids = m.days.map((x) => x.id);
    const next = L.moveInArray(ids, d.fromIdx, d.target.gap);
    if (next.join() === ids.join()) return rerender();
    runOp('reorderDays', { orderedIds: next }, (mm) => L.optimistic.reorderDays(mm, next));
  } else if (d.type === 'stay') {
    const args = stayArgs(d);
    if (!args) return rerender();
    runOp('moveStay', args, (mm) => L.optimistic.moveStay(mm, d.id, args.startDayId, args.endDayId, args));
  } else {
    const minutes = d.target.minutes;
    if (!minutes) return rerender();
    runOp('shiftBooking', { reservationId: d.id, minutes }, (mm) => L.optimistic.shiftTransport(mm, d.id, minutes));
  }
}

/**
 * The moveStay arguments for where a stay drag landed, or null if nothing moved.
 * Only times that differ from what the bar showed are sent, so an unset check-in
 * stays unset after a whole-day move. The check-in window keeps its length.
 */
function stayArgs(d: Extract<Drag, { type: 'stay' }>): OperationArgs['moveStay'] | null {
  const sp = d.target.span;
  if (sp[0] === d.span0[0] && sp[1] === d.span0[1]) return null;
  const days = model().days;
  const a = L.posToDayTime(sp[0]);
  const b = L.posToDayTime(sp[1]);
  const shownIn = d.stay.checkIn || '15:00';
  const shownOut = d.stay.checkOut || '11:00';
  const args: OperationArgs['moveStay'] = {
    stayId: d.id,
    startDayId: days[a.index].id,
    endDayId: days[b.index].id,
  };
  if (a.time !== shownIn) {
    args.checkIn = a.time;
    const windowStart = L.minutesOf(shownIn);
    const windowClose = L.minutesOf(d.stay.checkInEnd);
    if (windowStart != null && windowClose != null) {
      const windowEnd = a.minutes + (windowClose - windowStart);
      args.checkInEnd = windowEnd >= 1440 ? '23:59' : L.fmtHM(windowEnd);
    }
  }
  if (b.time !== shownOut) args.checkOut = b.time;
  return args;
}

export function finish(): void {
  const d = S.drag;
  if (!d) return;
  if (d.ghost) d.ghost.remove();
  if (d.tip) d.tip.remove();
  if (d.via === 'pointer') suppressClickUntil = Date.now() + 300;
  d.el.classList.remove('is-dragging', 'is-keymove');
  document.body.classList.remove('ts-grabbing');
  clearMarks();
  stopAutoScroll();
  S.drag = null;
}

export function cancel(): void {
  const wasKey = S.drag && S.drag.via === 'key';
  finish();
  rerender();
  if (wasKey) announce('Move cancelled.');
  flushQueuedRefresh();
}
