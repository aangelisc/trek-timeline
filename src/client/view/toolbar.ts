import { load, session } from '../data.ts';
import { h } from '../dom.ts';
import type { Zoom } from '../state.ts';
import { S, model, rerender } from '../state.ts';

export function renderToolbar(): HTMLElement {
  const m = model();
  const counts = { error: 0, warning: 0, info: 0 };
  for (const w of S.warnings) counts[w.level]++;
  const chipClass = {
    error: 'trek-chip--danger',
    warning: 'trek-chip--warning',
    info: 'trek-chip--info',
  };
  const noun = { error: 'clash', warning: 'warning', info: 'hint' };
  const chips: HTMLElement[] = (['error', 'warning', 'info'] as const)
    .filter((l) => counts[l])
    .map((l) =>
      h('button', {
        class: 'trek-chip ts-chipbtn ' + chipClass[l],
        'aria-expanded': S.showWarnings ? 'true' : 'false',
        text: counts[l] + ' ' + noun[l] + (counts[l] === 1 ? '' : l === 'error' ? 'es' : 's'),
        on: {
          click() {
            S.showWarnings = !S.showWarnings;
            rerender();
          },
        },
      }),
    );
  if (!chips.length) chips.push(h('span', { class: 'trek-chip trek-chip--success', text: 'No clashes' }));

  const titles: Record<Zoom, string> = {
    s: 'Narrow days',
    m: 'Medium days',
    l: 'Wide days',
  };
  const zoom = h(
    'div',
    { class: 'ts-seg', role: 'group', 'aria-label': 'Day width' },
    (['s', 'm', 'l'] as const).map((z) =>
      h('button', {
        'aria-pressed': S.zoom === z ? 'true' : 'false',
        text: z.toUpperCase(),
        title: titles[z],
        on: {
          click() {
            S.zoom = z;
            session('set', 'zoom', z);
            rerender();
          },
        },
      }),
    ),
  );

  const trayCount = m.unscheduled.places.length + m.unscheduled.bookings.length;
  return h('div', { class: 'ts-toolbar' }, [
    h('h1', { text: m.trip.title || 'Trip timeline' }),
    h('div', { class: 'ts-group' }, chips),
    S.mobile ? null : zoom,
    S.mobile
      ? null
      : h('button', {
          class: 'trek-btn trek-btn--ghost',
          'aria-pressed': S.trayOpen ? 'true' : 'false',
          text: 'Unscheduled' + (trayCount ? ' (' + trayCount + ')' : ''),
          on: {
            click() {
              S.trayOpen = !S.trayOpen;
              session('set', 'tray', S.trayOpen);
              rerender();
            },
          },
        }),
    h('button', {
      class: 'trek-btn trek-btn--ghost',
      text: 'Refresh',
      title: 'Reload from TREK',
      on: {
        click() {
          load();
        },
      },
    }),
  ]);
}
