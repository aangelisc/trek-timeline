// What the user sees during a drag: marks, the moved bar, the tooltip, the screen-reader
// readout, and scrolling at the timeline's edges.
import { announce, dayName, fmtDay, h } from '../dom.ts';
import type { Span } from '../lib.ts';
import * as L from '../lib.ts';
import type { Drag } from '../state.ts';
import { LABEL_W, app, dw, model } from '../state.ts';
import { daysArea, targetValid } from './targets.ts';

export function moveGhost(d: Drag, e: PointerEvent): void {
  if (!d.ghost) return;
  d.ghost.style.left = e.clientX - (d.offX || 0) + 'px';
  d.ghost.style.top = e.clientY - (d.offY || 0) + 'px';
}

export function clearMarks(): void {
  app.querySelectorAll('.ts-insert, .ts-gapmark').forEach((x) => x.remove());
  app.querySelectorAll('.is-target, .is-invalid').forEach((x) => x.classList.remove('is-target', 'is-invalid'));
}

export function paintTarget(d: Drag): void {
  clearMarks();
  const W = dw();
  if (d.type === 'item' || d.type === 'tray') {
    const col = app.querySelectorAll<HTMLElement>('.ts-daycol')[d.target.dayIdx];
    if (!col) return;
    const ok = targetValid(d);
    col.classList.add(ok ? 'is-target' : 'is-invalid');
    if (ok && d.type === 'item') {
      const cards = [...col.querySelectorAll('.ts-card')].filter((c) => c !== d.el);
      col.insertBefore(h('div', { class: 'ts-insert' }), cards[d.target.pos] || null);
    }
  } else if (d.type === 'day') {
    const area = daysArea();
    if (area) {
      area.style.position = 'relative';
      area.appendChild(
        h('div', {
          class: 'ts-gapmark',
          style: { left: d.target.gap * W + 'px' },
        }),
      );
    }
  } else if (d.type === 'stay') {
    const span = d.target.span;
    d.el.style.left = span[0] * W + 'px';
    d.el.style.width = Math.max(8, (span[1] - span[0]) * W) + 'px';
    const small = d.el.querySelector('small');
    if (small) small.textContent = nightsText(span);
    showTip(d, stayTip(d));
  } else if (d.type === 'transport') {
    const shift = 'translateX(' + (d.target.minutes / 1440) * W + 'px)';
    d.el.style.transform = shift;
    const lbl = app.querySelector<HTMLElement>('.ts-barlabel[data-for="' + d.id + '"]');
    if (lbl) lbl.style.transform = shift;
    showTip(d, transportTip(d));
  }
  announceTarget(d);
}

function nightsText(span: Span): string {
  const nights = L.posToDayTime(span[1]).index - L.posToDayTime(span[0]).index;
  return nights + ' night' + (nights === 1 ? '' : 's');
}

function dayShort(idx: number): string {
  const d = model().days[idx];
  return d ? (d.date ? fmtDay(d.date) : 'Day ' + d.number) : '';
}

export function stayTip(d: Extract<Drag, { type: 'stay' }>): string {
  const a = L.posToDayTime(d.target.span[0]);
  const b = L.posToDayTime(d.target.span[1]);
  return (
    'In ' +
    dayShort(a.index) +
    ' ' +
    a.time +
    '  →  out ' +
    dayShort(b.index) +
    ' ' +
    b.time +
    ' · ' +
    nightsText(d.target.span)
  );
}

export function transportTip(d: Extract<Drag, { type: 'transport' }>): string {
  const t = d.transport;
  const m = d.target.minutes;
  const dep = L.posToDayTime(t.start + m / 1440);
  let text = 'Departs ' + dayShort(dep.index) + ' ' + dep.time;
  const arrMin = L.minutesOf(t.arr.time);
  if (arrMin != null) {
    const arrDay = L.posToDayTime(t.end + m / 1440).index;
    text += '  →  arrives ' + (arrDay !== dep.index ? dayShort(arrDay) + ' ' : '') + L.fmtHM(arrMin + m);
  }
  return text;
}

/** A floating readout of where a timed drag will land. */
function showTip(d: Drag, text: string): void {
  if (!d.tip) {
    d.tip = h('div', { class: 'ts-dragtip', role: 'presentation' });
    document.body.appendChild(d.tip);
  }
  const tip = d.tip;
  tip.textContent = text;
  const r = d.el.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.left, window.innerWidth - tip.offsetWidth - 8));
  const top = r.top - tip.offsetHeight - 6;
  tip.style.left = left + 'px';
  tip.style.top = (top < 4 ? r.bottom + 6 : top) + 'px';
}

function announceTarget(d: Drag): void {
  if (d.via !== 'key') return;
  const days = model().days;
  if (d.type === 'item' || d.type === 'tray') {
    announce(
      dayName(days[d.target.dayIdx]) +
        (d.type === 'item' ? ', position ' + (d.target.pos + 1) : '') +
        (targetValid(d) ? '' : ', not allowed'),
    );
  } else if (d.type === 'day') {
    announce('Before ' + (days[d.target.gap] ? dayName(days[d.target.gap]) : 'the end'));
  } else if (d.type === 'stay') {
    announce(stayTip(d));
  } else {
    announce(transportTip(d));
  }
}

let scrollTimer: number | undefined;

let scrollStep = 0;

export function autoScroll(e: PointerEvent): void {
  const tl = app.querySelector('.ts-timeline');
  if (!tl) return;
  const r = tl.getBoundingClientRect();
  const edge = 48;
  scrollStep = e.clientX < r.left + LABEL_W + edge ? -14 : e.clientX > r.right - edge ? 14 : 0;
  if (scrollStep && !scrollTimer) {
    scrollTimer = window.setInterval(() => {
      tl.scrollLeft += scrollStep;
    }, 16);
  } else if (!scrollStep) stopAutoScroll();
}

export function stopAutoScroll(): void {
  clearInterval(scrollTimer);
  scrollTimer = undefined;
}
