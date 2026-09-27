import { h } from '../dom.ts';
import { S, model } from '../state.ts';

export function renderTray(): HTMLElement {
  const u = model().unscheduled;
  const lock = S.readOnly;
  const card = (kind: 'place' | 'booking', x: { id: number; title: string; reservationTime?: string | null }) =>
    h(
      'div',
      {
        class: 'ts-card ts-card--' + kind + (lock ? ' is-locked' : ''),
        tabindex: '0',
        'data-drag': lock ? null : 'tray',
        'data-kind': kind,
        'data-id': x.id,
        'data-key': 'tray:' + kind + ':' + x.id,
        title: lock ? null : 'Drag onto a day, or press M to place it with the keyboard',
        'aria-label': (kind === 'place' ? 'Unplanned place: ' : 'Undated booking: ') + x.title,
      },
      [
        kind === 'booking' && x.reservationTime
          ? h('span', {
              class: 'ts-time',
              text: x.reservationTime.slice(0, 10),
            })
          : null,
        h('span', { class: 'ts-title', text: x.title }),
      ],
    );
  return h('aside', { class: 'ts-tray', 'aria-label': 'Unscheduled' }, [
    h('h2', { text: 'Unscheduled' }),
    !u.places.length && !u.bookings.length ? h('p', { text: 'Everything has a day.' }) : null,
    u.places.length ? h('h3', { text: 'Places' }) : null,
    ...u.places.map((p) => card('place', p)),
    u.bookings.length ? h('h3', { text: 'Bookings' }) : null,
    ...u.bookings.map((b) => card('booking', b)),
  ]);
}
