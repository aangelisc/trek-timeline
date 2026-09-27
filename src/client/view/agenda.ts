// The mobile layout: one card per day, with pickers instead of drags.
import { runOp } from '../data.ts';
import { fmtDay, fmtMoney, h } from '../dom.ts';
import { canDropItem } from '../gestures.ts';
import type { WarningIndex } from '../lib.ts';
import * as L from '../lib.ts';
import { model } from '../state.ts';
import { daySelect } from './controls.ts';

export function renderAgenda(wIdx: WarningIndex): HTMLElement {
  const m = model();
  const list = m.days.map((d) => {
    const lines: HTMLElement[] = [];
    for (const s of m.stays) {
      if (s.startIndex == null || s.endIndex == null || !(s.startIndex <= d.index && d.index < s.endIndex)) continue;
      lines.push(
        h('div', { class: 'ts-aline' }, [
          h('span', {
            class: 'ts-dot',
            'data-level': wIdx.stay[s.id] || null,
            style: wIdx.stay[s.id] ? null : { background: 'var(--ts-success)' },
          }),
          h('span', {
            class: 'ts-grow',
            text: s.title + ' · night ' + (d.index - s.startIndex + 1) + ' of ' + s.nights,
          }),
        ]),
      );
    }
    for (const t of m.transport.filter((x) => Math.floor(x.start) === d.index)) {
      lines.push(
        h('div', { class: 'ts-aline' }, [
          h('span', {
            class: 'ts-grow',
            text: (t.dep.time ? t.dep.time + ' ' : '') + t.title,
          }),
          daySelect(
            null,
            (to) => {
              runOp('moveBooking', { reservationId: t.id, toDayId: to }, (mm) =>
                L.optimistic.moveTransport(mm, t.id, to),
              );
            },
            'Move ' + t.title,
            true,
          ),
        ]),
      );
    }
    for (const it of d.items) {
      const sameDayOnly = !canDropItem(it.kind, false);
      lines.push(
        h('div', { class: 'ts-aline' }, [
          h('span', {
            class: 'ts-grow',
            text: (it.time ? it.time + ' ' : '') + it.title,
          }),
          sameDayOnly
            ? null
            : daySelect(
                null,
                (to) => {
                  runOp('moveItem', { kind: it.kind, id: it.id, toDayId: to }, (mm) =>
                    L.optimistic.moveItem(mm, it.kind, it.id, to),
                  );
                },
                'Move ' + it.title,
                true,
              ),
        ]),
      );
    }
    if (!lines.length) lines.push(h('div', { class: 'ts-aline trek-muted', text: 'Nothing planned' }));
    return h('section', { class: 'ts-aday', 'data-day': d.id }, [
      h('header', null, [
        h('b', { text: 'Day ' + d.number }),
        h('span', { class: 'trek-muted', text: d.date ? fmtDay(d.date) : '' }),
        d.title ? h('span', { text: d.title }) : null,
        wIdx.day[d.id] ? h('span', { class: 'ts-dot', 'data-level': wIdx.day[d.id] }) : null,
        m.costs.available && d.cost ? h('span', { class: 'ts-amt', text: fmtMoney(d.cost) }) : null,
      ]),
      ...lines,
    ]);
  });
  const u = m.unscheduled;
  if (u.places.length || u.bookings.length) {
    list.push(
      h('section', { class: 'ts-aday' }, [
        h('header', null, h('b', { text: 'Unscheduled' })),
        ...u.places.map((p) =>
          h('div', { class: 'ts-aline' }, [
            h('span', { class: 'ts-grow', text: p.title }),
            daySelect(
              null,
              (to) => {
                runOp('assignPlace', { placeId: p.id, dayId: to }, (mm) =>
                  L.optimistic.scheduleFromTray(mm, 'place', p.id, to),
                );
              },
              'Plan ' + p.title,
              true,
            ),
          ]),
        ),
        ...u.bookings.map((b) =>
          h('div', { class: 'ts-aline' }, [
            h('span', { class: 'ts-grow', text: b.title }),
            daySelect(
              null,
              (to) => {
                runOp('moveBooking', { reservationId: b.id, toDayId: to }, (mm) =>
                  L.optimistic.scheduleFromTray(mm, 'booking', b.id, to),
                );
              },
              'Schedule ' + b.title,
              true,
            ),
          ]),
        ),
      ]),
    );
  }
  return h('div', { class: 'ts-agenda' }, list);
}
