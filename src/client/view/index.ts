// render(): the whole page from S. Registered with state.ts so every part can redraw.
import type { Warning } from '../../shared/types.ts';
import { load, session } from '../data.ts';
import { flash, h } from '../dom.ts';
import * as L from '../lib.ts';
import { LABEL_W, ROW, S, app, dw, model, setRenderer } from '../state.ts';
import { renderAgenda } from './agenda.ts';
import { renderSheet } from './sheet.ts';
import { renderTimeline } from './timeline.ts';
import { renderToolbar } from './toolbar.ts';
import { renderTray } from './tray.ts';

export function render(): void {
  const tl = app.querySelector('.ts-timeline');
  const scroll = tl ? tl.scrollLeft : null;
  const focusKey = document.activeElement && document.activeElement.getAttribute('data-key');

  app.textContent = '';
  app.setAttribute('aria-busy', S.loading ? 'true' : 'false');
  app.style.setProperty('--ts-dw', dw() + 'px');
  app.style.setProperty('--ts-label-w', LABEL_W + 'px');
  app.style.setProperty('--ts-row', ROW + 'px');

  if (!S.tripId) {
    app.appendChild(
      h('div', {
        class: 'ts-empty trek-muted',
        text: 'Open a trip to see its timeline.',
      }),
    );
    return;
  }
  if (S.loading) {
    app.appendChild(h('div', { class: 'ts-loading trek-muted', text: 'Loading the trip…' }));
    return;
  }
  if (!S.model) {
    app.appendChild(
      h('div', { class: 'ts-empty' }, [
        h('p', {
          class: 'trek-muted',
          text: 'Could not load this trip: ' + S.error,
        }),
        h('button', {
          class: 'trek-btn',
          text: 'Try again',
          on: {
            click() {
              S.loading = true;
              render();
              load();
            },
          },
        }),
      ]),
    );
    return;
  }
  if (!S.model.days.length) {
    app.appendChild(
      h('div', {
        class: 'ts-empty trek-muted',
        text: 'This trip has no days yet. Add dates or days in the Plan tab.',
      }),
    );
    return;
  }

  const wIdx = L.warningIndex(S.warnings);
  app.appendChild(renderToolbar());
  const banner = renderBanner();
  if (banner) app.appendChild(banner);
  if (S.showWarnings && S.warnings.length) app.appendChild(renderWarnings());

  if (S.mobile) {
    app.appendChild(renderAgenda(wIdx));
  } else {
    app.appendChild(h('div', { class: 'ts-main' }, [renderTimeline(wIdx), S.trayOpen ? renderTray() : null]));
  }
  app.appendChild(renderSheet());

  const ntl = app.querySelector('.ts-timeline');
  if (ntl && scroll != null) ntl.scrollLeft = scroll;
  if (focusKey) {
    const f = app.querySelector<HTMLElement>('[data-key="' + focusKey + '"]');
    if (f) f.focus({ preventScroll: true });
  }
}

function renderBanner(): HTMLElement | null {
  if (S.readOnly) {
    return h('div', { class: 'ts-banner', role: 'status' }, [
      h('span', null, [h('strong', { text: 'View only. ' }), 'You don’t have permission to edit this trip.']),
    ]);
  }
  const gated = !S.caps.reorderDays || !S.caps.moveItems;
  if (!gated || S.bannerDismissed) return null;
  return h('div', { class: 'ts-banner', role: 'note' }, [
    h('span', null, [
      h('strong', { text: 'Some moves need a newer TREK. ' }),
      'Reordering days and moving places or notes between days aren’t available to plugins yet. ' +
        'You can already move stays and bookings, reorder notes, and plan from the Unscheduled list.',
    ]),
    h('button', {
      class: 'trek-btn trek-btn--ghost',
      text: 'Dismiss',
      on: {
        click() {
          S.bannerDismissed = true;
          session('set', 'banner-dismissed', true, 'plugin');
          render();
        },
      },
    }),
  ]);
}

function renderWarnings(): HTMLElement {
  return h(
    'ul',
    { class: 'ts-warnings', 'aria-label': 'Clashes and gaps' },
    S.warnings.map((w) =>
      h(
        'li',
        null,
        h(
          'button',
          {
            on: {
              click() {
                revealWarning(w);
              },
            },
          },
          [h('span', { class: 'ts-dot', 'data-level': w.level }), h('span', { text: w.message })],
        ),
      ),
    ),
  );
}

function revealWarning(w: Warning): void {
  let dayId = w.dayId ?? null;
  if (dayId == null && w.reservationIds) {
    const ids = w.reservationIds;
    const t = model().transport.find((x) => ids.includes(x.id));
    if (t) dayId = t.dayId;
    else if (!S.trayOpen) {
      S.trayOpen = true;
      render();
    }
  }
  if (dayId == null) return;
  const sel = S.mobile ? '.ts-aday[data-day="' + dayId + '"]' : '.ts-dayhead[data-id="' + dayId + '"]';
  const el = app.querySelector<HTMLElement>(sel);
  if (!el) return;
  el.scrollIntoView({
    behavior: document.documentElement.hasAttribute('data-reduce-motion') ? 'auto' : 'smooth',
    inline: 'center',
    block: 'nearest',
  });
  for (const x of [el, app.querySelector<HTMLElement>('.ts-daycol[data-id="' + dayId + '"]')]) {
    if (!x) continue;
    flash(x);
  }
}

setRenderer(render);
