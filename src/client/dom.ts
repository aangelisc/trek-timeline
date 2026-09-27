// DOM building and formatting helpers.
import type { ModelDay } from '../shared/types.ts';
import { S, live } from './state.ts';

export type Child = Node | string | number | null | undefined | false;

export interface Attrs {
  [attr: string]: unknown;
  style?: Record<string, string> | null;
  on?: Record<string, (e: Event) => void>;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  kids?: Child | Child[],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'text') el.textContent = String(v);
      else if (k === 'style')
        for (const [p, x] of Object.entries(v as Record<string, string>)) el.style.setProperty(p, x);
      else if (k === 'on')
        for (const [ev, fn] of Object.entries(v as Record<string, (e: Event) => void>)) el.addEventListener(ev, fn);
      else if (k === 'value') (el as HTMLInputElement).value = String(v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of Array.isArray(kids) ? kids : kids == null ? [] : [kids]) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

export function closest(target: EventTarget | null, sel: string): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(sel) : null;
}

/** Restart the highlight animation on an element. */
export function flash(x: HTMLElement): void {
  x.classList.remove('is-flash');
  void x.offsetWidth;
  x.classList.add('is-flash');
}

export function fmtDay(date: string | null, opts?: Intl.DateTimeFormatOptions): string {
  if (!date) return '';
  try {
    return new Intl.DateTimeFormat(S.lang, {
      timeZone: 'UTC',
      ...(opts || { weekday: 'short', day: 'numeric', month: 'short' }),
    }).format(new Date(date + 'T00:00:00Z'));
  } catch {
    return date;
  }
}

export function fmtMoney(v: number): string {
  const cur = S.model && S.model.costs.currency;
  try {
    return cur
      ? new Intl.NumberFormat(S.lang, {
          style: 'currency',
          currency: cur,
          maximumFractionDigits: 0,
        }).format(v)
      : new Intl.NumberFormat(S.lang, { maximumFractionDigits: 0 }).format(v);
  } catch {
    return String(Math.round(v));
  }
}

export function dayName(d: ModelDay): string {
  return 'Day ' + d.number + (d.date ? ' · ' + fmtDay(d.date) : '');
}

export function announce(text: string): void {
  live.textContent = text;
}

export function editingCell(): boolean {
  const a = document.activeElement;
  return !!(a && a.classList && a.classList.contains('ts-cell'));
}
