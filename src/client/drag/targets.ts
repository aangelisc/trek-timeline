// Where a drag would land, from the pointer, and whether it may.
import { canDropItem } from '../gestures.ts';
import * as L from '../lib.ts';
import type { Drag } from '../state.ts';
import { DRAG_SNAP, S, SNAP_MIN, app, dw, model } from '../state.ts';

export function daysArea(): HTMLElement | null {
  return app.querySelector<HTMLElement>('.ts-dayheads');
}

export function dayIndexOf(id: number): number {
  const d = model().days.find((x) => x.id === id);
  return d ? d.index : -1;
}

/** Is the current target a legal drop? */
export function targetValid(d: Drag): boolean {
  if (d.type === 'item') {
    const toId = model().days[d.target.dayIdx].id;
    return canDropItem(d.kind, toId === d.fromDayId);
  }
  return true;
}

export function targetFromPointer(d: Drag, e: PointerEvent): void {
  const W = dw();
  const n = model().days.length;
  const area = daysArea();
  if (!area) return;
  const x = e.clientX - area.getBoundingClientRect().left;
  if (d.type === 'item' || d.type === 'tray') {
    const dayIdx = L.dayAt(x, W, n);
    const col = app.querySelectorAll('.ts-daycol')[dayIdx];
    const mids = [...col.querySelectorAll('.ts-card')]
      .filter((c) => c !== d.el)
      .map((c) => {
        const r = c.getBoundingClientRect();
        return r.top + r.height / 2;
      });
    d.target = { dayIdx, pos: L.insertionIndex(mids, e.clientY) };
  } else if (d.type === 'day') {
    d.target = { gap: L.gapAt(x, W, n) };
  } else {
    // Horizontal travel in days, snapped to the zoom's time step unless Shift asks for whole days.
    const delta = (e.clientX - (d.x0 || 0)) / W;
    const snap = e.shiftKey ? null : DRAG_SNAP[S.zoom] || SNAP_MIN;
    if (d.type === 'stay')
      d.target = {
        span: L.dragStay(d.span0, d.handle || null, delta, n, snap),
      };
    else
      d.target = {
        minutes: L.dragTransport(d.transport.start, delta, n, snap),
      };
  }
}
