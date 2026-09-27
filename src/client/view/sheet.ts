// The sheet under the timeline: Stays and Transport grids, edited inline, and Costs.
import type { BookingField, StayField } from '../../shared/types.ts';
import { runOp, session } from '../data.ts';
import { announce, flash, fmtMoney, h } from '../dom.ts';
import * as L from '../lib.ts';
import type { Tab } from '../state.ts';
import { S, app, model, rerender } from '../state.ts';
import { cellInput, daySelect } from './controls.ts';

const STATUSES = ['pending', 'confirmed', 'cancelled'];

export function renderSheet(): HTMLElement {
  const tabs: [Tab, string][] = [
    ['stays', 'Stays'],
    ['transport', 'Transport'],
  ];
  if (model().costs.available) tabs.push(['costs', 'Costs']);
  if (!tabs.some((t) => t[0] === S.tab)) S.tab = 'stays';
  const body = S.tab === 'stays' ? staysTable() : S.tab === 'transport' ? transportTable() : costsPanel();
  return h('section', { class: 'ts-sheet', 'aria-label': 'Sheet' }, [
    h('div', { class: 'ts-sheet-head' }, [
      h(
        'div',
        { class: 'ts-seg', role: 'tablist' },
        tabs.map(([id, text]) =>
          h('button', {
            role: 'tab',
            'aria-selected': S.tab === id ? 'true' : 'false',
            'aria-pressed': S.tab === id ? 'true' : 'false',
            text,
            on: {
              click() {
                S.tab = id;
                session('set', 'tab', id);
                rerender();
              },
            },
          }),
        ),
      ),
    ]),
    h('div', { class: 'ts-sheet-body', role: 'tabpanel' }, body),
  ]);
}

function staysTable(): HTMLElement {
  const m = model();
  if (!m.stays.length)
    return h('p', {
      class: 'ts-empty trek-muted',
      text: 'No stays yet. Add accommodation in the Plan tab.',
    });
  const head = ['Stay', 'Check-in day', 'Check-out day', 'Nights', 'Check-in', 'Until', 'Check-out', 'Confirmation'];
  if (m.costs.available) head.push('Cost');
  return h('table', { class: 'ts-table' }, [
    h(
      'thead',
      null,
      h(
        'tr',
        null,
        head.map((t) => h('th', { text: t })),
      ),
    ),
    h(
      'tbody',
      null,
      m.stays.map((s) => {
        const edit = (field: StayField) => (v: string) => {
          runOp('editStay', { stayId: s.id, fields: { [field]: v } });
        };
        const cells = [
          h('td', { class: 'ts-static' }, h('b', { text: s.title })),
          h(
            'td',
            null,
            daySelect(
              s.startDayId,
              (to) => {
                runOp('moveStay', { stayId: s.id, startDayId: to, endDayId: s.endDayId }, (mm) =>
                  L.optimistic.moveStay(mm, s.id, to, s.endDayId),
                );
              },
              'Check-in day for ' + s.title,
            ),
          ),
          h(
            'td',
            null,
            daySelect(
              s.endDayId,
              (to) => {
                runOp('moveStay', { stayId: s.id, startDayId: s.startDayId, endDayId: to }, (mm) =>
                  L.optimistic.moveStay(mm, s.id, s.startDayId, to),
                );
              },
              'Check-out day for ' + s.title,
            ),
          ),
          h('td', {
            class: 'ts-num',
            text: s.nights == null ? '—' : String(s.nights),
          }),
          h(
            'td',
            null,
            cellInput('time', s.checkIn, 'stay-in:' + s.id, edit('check_in'), {
              'aria-label': 'Check-in time',
            }),
          ),
          h(
            'td',
            null,
            cellInput('time', s.checkInEnd, 'stay-until:' + s.id, edit('check_in_end'), {
              'aria-label': 'Check-in until',
            }),
          ),
          h(
            'td',
            null,
            cellInput('time', s.checkOut, 'stay-out:' + s.id, edit('check_out'), { 'aria-label': 'Check-out time' }),
          ),
          h(
            'td',
            null,
            cellInput('text', s.confirmation, 'stay-conf:' + s.id, edit('confirmation'), {
              'aria-label': 'Confirmation',
              placeholder: '—',
            }),
          ),
        ];
        if (m.costs.available) cells.push(h('td', { class: 'ts-num', text: s.cost ? fmtMoney(s.cost) : '—' }));
        return h('tr', { 'data-row': 'stay:' + s.id, tabindex: '-1' }, cells);
      }),
    ),
  ]);
}

function transportTable(): HTMLElement {
  const m = model();
  const rows = m.transport;
  if (!rows.length)
    return h('p', {
      class: 'ts-empty trek-muted',
      text: 'No transport bookings yet.',
    });
  const head = [
    'Type',
    'Booking',
    'Route',
    'Departs',
    'Dep. time',
    'Arr. time',
    'In transit',
    'Status',
    'Confirmation',
  ];
  if (m.costs.available) head.push('Cost');
  return h('table', { class: 'ts-table' }, [
    h(
      'thead',
      null,
      h(
        'tr',
        null,
        head.map((t) => h('th', { text: t })),
      ),
    ),
    h(
      'tbody',
      null,
      rows.map((t) => {
        const edit = (field: BookingField) => (v: string) => {
          runOp('editBooking', { reservationId: t.id, fields: { [field]: v } });
        };
        const statuses = !t.status || STATUSES.includes(t.status) ? STATUSES : [...STATUSES, t.status];
        const status = h(
          'select',
          {
            class: 'trek-select',
            'aria-label': 'Status of ' + t.title,
            on: {
              change() {
                edit('status')(status.value);
              },
            },
          },
          statuses.map((st) => {
            const o = h('option', {
              value: st,
              text: st.charAt(0).toUpperCase() + st.slice(1),
            });
            if (st === (t.status || 'pending')) o.selected = true;
            return o;
          }),
        );
        if (S.readOnly) status.disabled = true;
        const cells = [
          h('td', { class: 'ts-static trek-muted', text: t.type || '' }),
          h(
            'td',
            null,
            cellInput('text', t.title, 'tr-title:' + t.id, edit('title'), {
              'aria-label': 'Booking title',
            }),
          ),
          h('td', {
            class: 'ts-static',
            text: (t.dep.name || '?') + ' → ' + (t.arr.name || '?'),
          }),
          h(
            'td',
            null,
            daySelect(
              t.dayId,
              (to) => {
                runOp('moveBooking', { reservationId: t.id, toDayId: to }, (mm) =>
                  L.optimistic.moveTransport(mm, t.id, to),
                );
              },
              'Departure day for ' + t.title,
            ),
          ),
          h(
            'td',
            null,
            cellInput('time', t.dep.time, 'tr-dep:' + t.id, edit('depTime'), {
              'aria-label': 'Departure time (local)',
            }),
          ),
          h(
            'td',
            null,
            cellInput('time', t.arr.time, 'tr-arr:' + t.id, edit('arrTime'), {
              'aria-label': 'Arrival time (local)',
            }),
          ),
          h('td', {
            class: 'ts-static ts-num',
            text: t.durationMin ? L.fmtDuration(t.durationMin) : '—',
          }),
          h('td', null, status),
          h(
            'td',
            null,
            cellInput('text', t.confirmation, 'tr-conf:' + t.id, edit('confirmation_number'), {
              'aria-label': 'Confirmation',
              placeholder: '—',
            }),
          ),
        ];
        if (m.costs.available) cells.push(h('td', { class: 'ts-num', text: t.cost ? fmtMoney(t.cost) : '—' }));
        return h('tr', { 'data-row': 'transport:' + t.id, tabindex: '-1' }, cells);
      }),
    ),
  ]);
}

function costsPanel(): HTMLElement {
  const c = model().costs;
  const max = c.byCategory.reduce((a, x) => Math.max(a, x.total), 0) || 1;
  return h('div', { class: 'ts-costs' }, [
    h('div', null, [
      h('div', { class: 'trek-muted', text: 'Trip total' }),
      h('div', { class: 'ts-total', text: fmtMoney(c.total) }),
    ]),
    h(
      'div',
      { style: { display: 'grid', gap: '8px' } },
      c.byCategory.map((x) =>
        h('div', { class: 'ts-costbar' }, [
          h('span', { text: x.category }),
          h(
            'div',
            { class: 'ts-track' },
            h('div', {
              class: 'ts-fill',
              style: { width: (x.total / max) * 100 + '%' },
            }),
          ),
          h('span', { class: 'ts-amt', text: fmtMoney(x.total) }),
        ]),
      ),
    ),
    c.unallocated
      ? h('p', {
          class: 'trek-muted',
          text: fmtMoney(c.unallocated) + ' isn’t tied to a day (no date, booking or planned place).',
        })
      : null,
    h('div', { class: 'ts-costfoot' }, [
      h('button', {
        class: 'trek-btn trek-btn--secondary',
        text: 'Edit in Costs',
        on: {
          click() {
            trek.navigate('/trips/' + S.tripId + '?tab=finanzplan');
          },
        },
      }),
      h('span', {
        class: 'trek-muted',
        text: 'Costs are read-only here. For a category spreadsheet, try the Budget Table plugin.',
      }),
    ]),
  ]);
}

/** Open a stay or transport booking's row in the sheet and point it out. */
export function revealRow(ref: string): void {
  const kind = ref.split(':')[0];
  S.tab = kind === 'stay' ? 'stays' : 'transport';
  session('set', 'tab', S.tab);
  rerender();
  const tr = app.querySelector<HTMLElement>('tr[data-row="' + ref + '"]');
  if (!tr) return;
  const smooth = !document.documentElement.hasAttribute('data-reduce-motion');
  tr.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' });
  tr.focus({ preventScroll: true });
  flash(tr);
  announce('Showing it in the ' + S.tab + ' sheet.');
}
