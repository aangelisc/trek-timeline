// The pointer path: press, move 5px to start, drop to commit.
import { closest } from '../dom.ts';
import type { Handle } from '../lib.ts';
import { S, app } from '../state.ts';
import { beginDrag, cancel, commit } from './controller.ts';
import { autoScroll, moveGhost, paintTarget } from './paint.ts';
import { targetFromPointer } from './targets.ts';

let pending: {
  el: HTMLElement;
  x0: number;
  y0: number;
  handle: Handle;
} | null = null;

export function onPointerDown(e: PointerEvent): void {
  if (e.button !== 0 || S.busy || S.readOnly || S.drag) return;
  if (closest(e.target, 'input, select, textarea, button')) return;
  const el = closest(e.target, '[data-drag]');
  if (!el || !app.contains(el)) return;
  const handle = closest(e.target, '[data-handle]');
  pending = {
    el,
    x0: e.clientX,
    y0: e.clientY,
    handle: handle ? (handle.getAttribute('data-handle') as Handle) : null,
  };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
}

/** Stop following the pointer: the press was released, cancelled or ended by the keyboard. */
function detach(): void {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerCancel);
}

function onPointerMove(e: PointerEvent): void {
  // Escape can end a pointer drag from the keyboard; the next move just lets go.
  if (!pending && !S.drag) {
    detach();
    return;
  }
  if (pending && !S.drag) {
    if (Math.abs(e.clientX - pending.x0) + Math.abs(e.clientY - pending.y0) < 5) return;
    const d = beginDrag(pending.el, 'pointer', e);
    if (d) {
      d.x0 = pending.x0;
      d.handle = pending.handle;
    }
    pending = null;
  }
  const dr = S.drag;
  if (!dr) return;
  e.preventDefault();
  moveGhost(dr, e);
  targetFromPointer(dr, e);
  paintTarget(dr);
  autoScroll(e);
}

function onPointerUp(): void {
  detach();
  if (pending) {
    pending = null;
    return;
  }
  if (S.drag) commit(S.drag);
}

function onPointerCancel(): void {
  detach();
  pending = null;
  if (S.drag) cancel();
}
