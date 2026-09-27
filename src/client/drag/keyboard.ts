// The keyboard path: focus a draggable, press M, arrows pick a target, Enter drops.
import { announce, closest } from '../dom.ts';
import type { Handle } from '../lib.ts';
import * as L from '../lib.ts';
import { S, SNAP_MIN, app, model } from '../state.ts';
import { revealRow } from '../view/sheet.ts';
import { beginDrag, cancel, commit } from './controller.ts';
import { paintTarget } from './paint.ts';

/** A stay's handle for a keyboard move: Shift = check-out, Alt = check-in. */
function keyHandle(e: KeyboardEvent): Handle {
  return e.shiftKey ? 'end' : e.altKey ? 'start' : null;
}

// Keyboard path: focus a draggable, press M, arrows pick a target, Enter drops.
export function onKeyDown(e: KeyboardEvent): void {
  const d = S.drag;
  if (d && e.key === 'Escape') {
    e.preventDefault();
    cancel();
    return;
  }
  if (d && d.via === 'key') {
    const days = model().days;
    const n = days.length;
    let handled = true;
    if (e.key === 'Enter' || e.key === ' ') commit(d);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const step = e.key === 'ArrowLeft' ? -1 : 1;
      if (d.type === 'item' || d.type === 'tray') {
        const t = d.target;
        t.dayIdx = L.clamp(t.dayIdx + step, 0, n - 1);
        t.pos = Math.min(t.pos, days[t.dayIdx].items.length);
      } else if (d.type === 'day') d.target.gap = L.clamp(d.target.gap + step, 0, n);
      else if (d.type === 'stay')
        d.target = {
          span: L.dragStay(d.target.span, keyHandle(e), step, n, null),
        };
      else d.target.minutes += L.dragTransport(d.transport.start + d.target.minutes / 1440, step, n, null);
    } else if ((e.code === 'Comma' || e.code === 'Period') && (d.type === 'stay' || d.type === 'transport')) {
      // , and . nudge by a quarter hour (Shift / Alt pick a stay's check-out / check-in).
      const q = (e.code === 'Comma' ? -SNAP_MIN : SNAP_MIN) / 1440;
      if (d.type === 'stay')
        d.target = {
          span: L.dragStay(d.target.span, keyHandle(e), q, n, SNAP_MIN),
        };
      else d.target.minutes += L.dragTransport(d.transport.start + d.target.minutes / 1440, q, n, SNAP_MIN);
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && d.type === 'item') {
      const t = d.target;
      const len = days[t.dayIdx].items.filter((it) => !(it.kind === d.kind && it.id === d.id)).length;
      t.pos = L.clamp(t.pos + (e.key === 'ArrowUp' ? -1 : 1), 0, len);
    } else handled = false;
    if (handled) {
      e.preventDefault();
      if (S.drag) paintTarget(S.drag);
    }
    return;
  }
  const active = document.activeElement;
  if (!d && e.key === 'Enter' && active && active.hasAttribute('data-reveal') && app.contains(active)) {
    e.preventDefault();
    revealRow(active.getAttribute('data-reveal')!);
    return;
  }
  if (!d && (e.key === 'm' || e.key === 'M') && !e.metaKey && !e.ctrlKey && !S.busy && !S.readOnly) {
    const el = closest(active, '[data-drag]');
    if (!el || !app.contains(el)) return;
    e.preventDefault();
    const dd = beginDrag(el, 'key');
    if (!dd) return;
    paintTarget(dd);
    announce('Moving. Use the arrow keys to choose where, Enter to drop, Escape to cancel.');
  }
}
