import type {
  DryRunResponse,
  Failure,
  Model,
  OperationArgs,
  OperationName,
  OperationRequest,
  OpResponse,
  TimelineResponse,
} from '../shared/types.ts';
import { announce, editingCell } from './dom.ts';
import { app, model, rerender, S } from './state.ts';

const OWN_ECHO_MS = 1000;

const CONFIRM_TITLES: Partial<Record<OperationName, string>> = {
  reorderDays: 'Reorder days?',
  moveBooking: 'Move this booking?',
  moveStay: 'Change this stay?',
  moveItem: 'Move this item?',
};

export function session(
  method: 'get' | 'set',
  key: string,
  value?: unknown,
  scope?: 'plugin' | 'trip',
): Promise<unknown> {
  try {
    const opts = { scope: scope || ('trip' as const) };
    const p = method === 'get' ? trek.session.get(key, opts) : trek.session.set(key, value, opts);
    return p.catch(() => undefined);
  } catch {
    return Promise.resolve(undefined);
  }
}

class ApiError extends Error {
  status: number | undefined;
  readOnly: boolean;
  constructor(f: Failure) {
    super(f.error || 'Request failed');
    this.status = f.status;
    this.readOnly = !!f.readOnly;
  }
}

type Ok<R> = Exclude<R, Failure>;

function api<R extends { ok: boolean }>(path: string, body?: OperationRequest): Promise<Ok<R>> {
  const p = body ? trek.invoke<R>(path, { method: 'POST', body }) : trek.invoke<R>(path);
  return p.then((res) => {
    if (res && res.ok === false) throw new ApiError(res as unknown as Failure);
    return res as Ok<R>;
  });
}

function applyTimeline(res: Ok<TimelineResponse> | Ok<OpResponse>): void {
  S.model = res.model;
  S.warnings = res.warnings || [];
  S.caps = res.capabilities || {};
  S.error = null;
}

export function load(): Promise<void> | undefined {
  if (!S.tripId) return;
  return api<TimelineResponse>('/timeline?tripId=' + encodeURIComponent(S.tripId)).then(
    (res) => {
      applyTimeline(res);
      S.loading = false;
      rerender();
    },
    (e: Error) => {
      S.loading = false;
      S.error = e.message;
      rerender();
    },
  );
}

/** Live updates: refetch once a burst of core events settles, never mid-drag. */
export function queueRefresh(): void {
  if (Date.now() - S.ownWriteAt < OWN_ECHO_MS) return;
  if (S.drag || S.busy || editingCell()) {
    S.refreshQueued = true;
    return;
  }
  clearTimeout(S.refreshTimer);
  S.refreshTimer = window.setTimeout(() => {
    if (editingCell()) {
      S.refreshQueued = true;
      return;
    }
    load();
  }, 300);
}

export function flushQueuedRefresh(): void {
  if (S.refreshQueued && !S.drag && !S.busy && !editingCell()) {
    S.refreshQueued = false;
    queueRefresh();
  }
}

export function showError(e: unknown): void {
  if (!e) return;
  const err = e as Partial<ApiError>;
  if (err.readOnly) {
    S.readOnly = true;
    rerender();
    trek.notify('warning', 'You can view this trip but not edit it.');
  } else if (err.status === 501) {
    trek.notify('info', err.message || '');
  } else {
    trek.notify('error', err.message || 'Something went wrong');
  }
}

/**
 * Every edit goes through here: show the change at once, ask TREK what it will do,
 * confirm anything destructive, then write. Any failure puts the old model back.
 */
export function runOp<K extends OperationName>(
  op: K,
  args: OperationArgs[K],
  optimistic?: (m: Model) => Model,
): Promise<void> {
  if (S.busy || S.readOnly || !S.tripId) return Promise.resolve();
  S.busy = true;
  app.setAttribute('data-busy', '');
  const before = S.model;
  if (optimistic) {
    S.model = optimistic(model());
    rerender();
  }
  const body: OperationRequest<K> = { tripId: S.tripId, op, args };
  return api<DryRunResponse>('/op', { dryRun: true, ...body })
    .then((dry) => {
      if (dry.impact.noop) return false;
      if (!dry.impact.destructive) return true;
      return trek.confirm({
        title: CONFIRM_TITLES[op] || 'Apply this change?',
        message: dry.impact.summary.join('\n'),
        confirmLabel: 'Apply',
        cancelLabel: 'Cancel',
        danger: true,
      });
    })
    .then((go) => {
      if (!go) {
        S.model = before;
        rerender();
        return;
      }
      S.ownWriteAt = Date.now();
      return api<OpResponse>('/op', body).then((res) => {
        S.ownWriteAt = Date.now();
        applyTimeline(res);
        rerender();
        announce(res.impact.summary[0] || 'Saved.');
      });
    })
    .catch((e) => {
      S.model = before;
      rerender();
      showError(e);
    })
    .then(() => {
      S.busy = false;
      app.removeAttribute('data-busy');
      flushQueuedRefresh();
    });
}
