// Trek Timeline page. Bundled into one classic script (client/app.js): the frame is
// sandboxed at an opaque origin and reaches TREK only through window.trek.
//   state.ts    page state and shared constants     dom.ts     h() and formatting
//   data.ts     routes, live refresh, runOp          view/      render() and its parts
//   drag/       pointer and keyboard moves           lib.ts     pure helpers (tested in node)
import { load, queueRefresh, session } from './data.ts';
import { closest } from './dom.ts';
import { clicksSuppressed } from './drag/controller.ts';
import { onKeyDown } from './drag/keyboard.ts';
import { onPointerDown } from './drag/pointer.ts';
import { S, app, isTab, isZoom } from './state.ts';
import { render } from './view/index.ts';
import { revealRow } from './view/sheet.ts';

const REFRESH_FAMILIES = new Set([
  'day',
  'assignment',
  'dayNote',
  'reservation',
  'accommodation',
  'budget',
  'place',
  'trip',
]);

/** A click on a stay or transport bar opens its row in the sheet. */
function onClick(e: MouseEvent): void {
  if (clicksSuppressed() || S.drag) return;
  const el = closest(e.target, '[data-reveal]');
  if (el && app.contains(el)) revealRow(el.getAttribute('data-reveal')!);
}

document.addEventListener('pointerdown', onPointerDown);
document.addEventListener('keydown', onKeyDown);
document.addEventListener('click', onClick);

trek.onContext((ctx) => {
  const tripId = ctx.tripId != null ? String(ctx.tripId) : null;
  const mobile = !!(ctx.viewport && ctx.viewport.formFactor === 'mobile');
  S.lang = ctx.locale || document.documentElement.lang || 'en';
  const changed = tripId !== S.tripId;
  const layoutChanged = mobile !== S.mobile;
  S.tripId = tripId;
  S.mobile = mobile;
  if (changed) {
    S.model = null;
    S.loading = !!tripId;
    render();
    Promise.all([
      session('get', 'zoom'),
      session('get', 'tab'),
      session('get', 'tray'),
      session('get', 'banner-dismissed', null, 'plugin'),
    ])
      .then(([zoom, tab, tray, dismissed]) => {
        if (isZoom(zoom)) S.zoom = zoom;
        if (isTab(tab)) S.tab = tab;
        if (typeof tray === 'boolean') S.trayOpen = tray;
        if (dismissed === true) S.bannerDismissed = true;
      })
      .then(load);
  } else if (layoutChanged && S.model) {
    render();
  }
});

trek.onEvent((event) => {
  const family = String(event || '').split(':')[0];
  if (REFRESH_FAMILIES.has(family)) queueRefresh();
});
