// Form controls shared by the agenda and the sheet.
import { flushQueuedRefresh } from '../data.ts';
import type { Attrs } from '../dom.ts';
import { dayName, h } from '../dom.ts';
import { S, model } from '../state.ts';

export function daySelect(
  current: number | null,
  onPick: (dayId: number) => void,
  label: string,
  allowNone?: boolean,
): HTMLSelectElement {
  const sel = h(
    'select',
    {
      class: 'trek-select',
      'aria-label': label,
      on: {
        change() {
          if (sel.value) onPick(Number(sel.value));
        },
      },
    },
    [
      ...(allowNone ? [h('option', { value: '', text: 'Move to…' })] : []),
      ...model().days.map((d) => {
        const o = h('option', { value: String(d.id), text: dayName(d) });
        if (d.id === current) o.selected = true;
        return o;
      }),
    ],
  );
  if (S.readOnly) sel.disabled = true;
  return sel;
}

/**
 * An inline grid cell. It saves on Enter or when focus leaves, never on `change`:
 * a time input fires `change` on every keystroke, and saving there re-rendered the
 * cell mid-entry, so each digit landed in the hours again.
 */
export function cellInput(
  type: 'time' | 'text',
  value: string | null,
  key: string,
  onCommit: (v: string) => void,
  attrs?: Attrs,
): HTMLInputElement {
  const el = h('input', {
    class: 'ts-cell',
    type,
    value: value || '',
    'data-key': key,
    ...attrs,
  });
  const original = value || '';
  if (S.readOnly) el.disabled = true;
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      el.blur();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      el.value = original;
      el.blur();
    }
  });
  el.addEventListener('blur', () => {
    // A half-typed time reads as '' (invalid): keep the old value rather than clear it.
    if (type === 'time' && el.value === '' && el.validity && el.validity.badInput) el.value = original;
    if (el.value !== original) onCommit(el.value);
    else flushQueuedRefresh();
  });
  return el;
}
