// The timeline: day headers, then the Stays, Transport, Plan and Costs lanes.
import type { DayItem, ItemKind, ModelDay, Stay, Transport } from '../../shared/types.ts';
import { dayName, fmtDay, fmtMoney, h } from '../dom.ts';
import { itemLockReason } from '../gestures.ts';
import type { WarningIndex } from '../lib.ts';
import * as L from '../lib.ts';
import { LABEL_W, ROW, S, dw, model } from '../state.ts';

function laneHeight(rows: number[]): string {
  return Math.max(1, Math.max(0, ...rows) + 1) * ROW + 6 + 'px';
}

export function renderTimeline(wIdx: WarningIndex): HTMLElement {
  const m = model();
  const n = m.days.length;
  const W = dw();
  const width = LABEL_W + n * W;
  const lock = S.readOnly;

  // Header row
  const heads = h(
    'div',
    { class: 'ts-days ts-dayheads' },
    m.days.map((d) => {
      const canDrag = !lock && S.caps.reorderDays;
      return h(
        'div',
        {
          class: 'ts-dayhead',
          'data-id': d.id,
          'data-key': 'day:' + d.id,
          'data-drag': canDrag ? 'day' : null,
          tabindex: '0',
          title: canDrag
            ? 'Drag to reorder days, or press M to move with the keyboard'
            : S.caps.reorderDays
              ? null
              : 'Reordering days needs a newer TREK',
          'aria-label': dayName(d) + (d.title ? ', ' + d.title : ''),
        },
        [
          h('span', { class: 'ts-dnum' }, [
            'DAY ' + d.number,
            wIdx.day[d.id] ? h('span', { class: 'ts-dot', 'data-level': wIdx.day[d.id] }) : null,
          ]),
          h('span', { class: 'ts-ddate', text: d.date ? fmtDay(d.date) : '—' }),
          h('span', { class: 'ts-dtitle', text: d.title || '' }),
        ],
      );
    }),
  );

  // Stays lane
  const stays = m.stays.filter((s) => s.startIndex != null && s.endIndex != null);
  const stayRows = L.packLanes(
    stays,
    (s) => L.staySpan(s)[0],
    (s) => L.staySpan(s)[1],
  );
  const stayLane = h(
    'div',
    {
      class: 'ts-lane',
      style: { width: n * W + 'px', height: laneHeight(stayRows) },
    },
    stays.map((s, i) => stayBar(s, stayRows[i], wIdx)),
  );

  // Transport lane. Rows are packed by what is drawn, so a short hop's outside
  // label never runs into the next bar.
  const tr = m.transport;
  const trRows = L.packLanes(
    tr,
    (t) => t.start,
    (t) => transportExtent(t),
  );
  const trLane = h(
    'div',
    {
      class: 'ts-lane',
      style: { width: n * W + 'px', height: laneHeight(trRows) },
    },
    tr.flatMap((t, i) => transportBar(t, trRows[i], wIdx)),
  );

  // Plan lane
  const plan = h(
    'div',
    { class: 'ts-days' },
    m.days.map((d) =>
      h(
        'div',
        {
          class: 'ts-daycol',
          'data-id': d.id,
          'aria-label': 'Plan for ' + dayName(d),
        },
        d.items.map((it) => itemCard(it, d, wIdx)),
      ),
    ),
  );

  // Costs lane
  const costs = h(
    'div',
    { class: 'ts-days' },
    m.days.map((d) =>
      h(
        'div',
        { class: 'ts-daycost' },
        d.cost ? [h('b', { text: fmtMoney(d.cost) })] : [h('span', { class: 'trek-faint', text: '—' })],
      ),
    ),
  );

  const rows = [row('', heads, 'ts-row--head'), row('Stays', stayLane), row('Transport', trLane), row('Plan', plan)];
  if (m.costs.available) rows.push(row('Costs', costs));
  return h(
    'div',
    { class: 'ts-timeline', role: 'region', 'aria-label': 'Trip timeline' },
    h('div', { class: 'ts-canvas', style: { width: width + 'px' } }, rows),
  );
}

function row(label: string, content: HTMLElement, extra?: string): HTMLElement {
  return h('div', { class: 'ts-row ' + (extra || '') }, [h('div', { class: 'ts-label', text: label }), content]);
}

function stayBar(s: Stay, rowIdx: number, wIdx: WarningIndex): HTMLElement {
  const W = dw();
  const span = L.staySpan(s);
  const canDrag = !S.readOnly;
  const nights = s.nights + ' night' + (s.nights === 1 ? '' : 's');
  return h(
    'div',
    {
      class: 'ts-bar ts-bar--stay',
      'data-drag': canDrag ? 'stay' : null,
      'data-id': s.id,
      'data-key': 'stay:' + s.id,
      tabindex: '0',
      'data-reveal': 'stay:' + s.id,
      'data-level': wIdx.stay[s.id] || null,
      style: {
        left: span[0] * W + 'px',
        width: Math.max(8, (span[1] - span[0]) * W) + 'px',
        top: rowIdx * ROW + 3 + 'px',
      },
      title:
        s.title +
        ' · ' +
        nights +
        (s.checkIn ? ' · in ' + s.checkIn : '') +
        (s.checkOut ? ' · out ' + s.checkOut : '') +
        '\nClick to open it in the sheet.' +
        (canDrag
          ? '\nDrag to change days and times (hold Shift for whole days). Drag an edge for check-in or check-out.' +
            '\nKeyboard: M, then arrows for days or , and . for 15 minutes (Shift = check-out, Alt = check-in).'
          : ''),
      'aria-label': 'Stay: ' + s.title + ', ' + nights,
    },
    [
      canDrag ? h('span', { class: 'ts-handle', 'data-handle': 'start' }) : null,
      h('span', { text: s.title }),
      h('small', { text: nights }),
      canDrag ? h('span', { class: 'ts-handle', 'data-handle': 'end' }) : null,
    ],
  );
}

// A bar narrower than NARROW_PX shows its label beside it, up to LABEL_PX wide.
const NARROW_PX = 150;

const LABEL_PX = 230;

function transportExtent(t: Transport): number {
  const W = dw();
  return (t.end - t.start) * W >= NARROW_PX ? t.end : t.end + (LABEL_PX + 8) / W;
}

function transportBar(t: Transport, rowIdx: number, wIdx: WarningIndex): HTMLElement[] {
  const W = dw();
  const canDrag = !S.readOnly;
  const route = (t.dep.name || '?') + ' → ' + (t.arr.name || '?');
  const times = (t.dep.time || '') + (t.arr.time ? '–' + t.arr.time : '');
  const dur = t.durationMin ? L.fmtDuration(t.durationMin) : '';
  const narrow = (t.end - t.start) * W < NARROW_PX;
  const text = [h('span', { text: route }), h('small', { text: [times, dur].filter(Boolean).join(' · ') })];
  const bar = h(
    'div',
    {
      class: 'ts-bar ts-bar--transport' + (t.durationKnown ? '' : ' is-estimate'),
      'data-drag': canDrag ? 'transport' : null,
      'data-id': t.id,
      'data-key': 'transport:' + t.id,
      tabindex: '0',
      'data-reveal': 'transport:' + t.id,
      'data-level': wIdx.booking[t.id] || null,
      style: {
        left: t.start * W + 'px',
        width: Math.max(8, (t.end - t.start) * W) + 'px',
        top: rowIdx * ROW + 3 + 'px',
      },
      title:
        t.title +
        '\n' +
        route +
        (times ? ' · ' + times : '') +
        (dur ? ' · ' + dur + ' in transit' : '') +
        (t.crossesTimezones ? ' (local times)' : '') +
        (t.durationKnown ? '' : '\nArrival unknown: width is an estimate') +
        '\nClick to open it in the sheet.' +
        (canDrag
          ? '\nDrag to change the day and time (hold Shift for whole days). Keyboard: M, then arrows for days or , and . for 15 minutes.'
          : ''),
      'aria-label': (t.type || 'Transport') + ': ' + t.title + ', ' + route + (times ? ', ' + times : ''),
    },
    narrow ? null : text,
  );
  for (const st of t.stops || []) {
    if (st.at == null || st.at <= t.start || st.at >= t.end) continue;
    bar.appendChild(
      h('span', {
        class: 'ts-stop',
        title: 'Stop: ' + st.name + (st.time ? ' ' + st.time : ''),
        style: { left: (st.at - t.start) * W + 'px' },
      }),
    );
  }
  if (!narrow) return [bar];
  const label = h(
    'div',
    {
      class: 'ts-barlabel',
      'aria-hidden': 'true',
      'data-for': t.id,
      'data-reveal': 'transport:' + t.id,
      style: {
        left: t.end * W + 6 + 'px',
        top: rowIdx * ROW + 3 + 'px',
        'max-width': LABEL_PX + 'px',
      },
    },
    text,
  );
  return [bar, label];
}

const KIND_LABEL: Record<ItemKind, string> = {
  place: 'Place',
  note: 'Note',
  booking: 'Booking',
};

function itemCard(it: DayItem, day: ModelDay, wIdx: WarningIndex): HTMLElement {
  const lockReason = S.readOnly ? 'View only' : itemLockReason(it.kind);
  const draggable = !lockReason && !it.pending;
  const category = it.kind === 'place' ? it.category : null;
  const cls = 'ts-card ts-card--' + it.kind + (draggable ? '' : ' is-locked') + (it.pending ? ' is-pending' : '');
  const style = category && category.color ? { '--ts-cat': category.color } : null;
  return h(
    'div',
    {
      class: cls,
      style,
      tabindex: '0',
      'data-drag': draggable ? 'item' : null,
      'data-kind': it.kind,
      'data-id': it.id,
      'data-day': day.id,
      'data-key': it.kind + ':' + it.id,
      'data-level': it.kind === 'booking' ? wIdx.booking[it.id] || null : null,
      title:
        lockReason ||
        (category ? category.name : it.kind === 'note' ? 'Note' : (it.kind === 'booking' && it.type) || 'Booking'),
      'aria-label': KIND_LABEL[it.kind] + ': ' + it.title + (it.time ? ' at ' + it.time : ''),
    },
    [it.time ? h('span', { class: 'ts-time', text: it.time }) : null, h('span', { class: 'ts-title', text: it.title })],
  );
}
