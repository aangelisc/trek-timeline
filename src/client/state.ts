// Page state and the constants every part of the page shares.
import type { Capabilities, ItemKind, Model, Stay, Transport, Warning } from '../shared/types.ts';
import type { Handle, Span } from './lib.ts';

export type Zoom = 's' | 'm' | 'l';

export type Tab = 'stays' | 'transport' | 'costs';

export const ZOOM: Record<Zoom, number> = { s: 108, m: 148, l: 212 };

export const LABEL_W = 92;

export const ROW = 30;

export const SNAP_MIN = 15; // keyboard nudge, and the finest drag snap

// Drag snap per zoom, so each step is a few pixels rather than one. Shift snaps to whole days.
export const DRAG_SNAP: Record<Zoom, number> = { s: 60, m: 30, l: 15 };

export interface DragBase {
  el: HTMLElement;
  id: number;
  via: 'pointer' | 'key';
  ghost: HTMLElement | null;
  tip?: HTMLElement;
  offX?: number;
  offY?: number;
  /** Pointer x where the drag started. */
  x0?: number;
  handle?: Handle;
}

export type DropTarget = { dayIdx: number; pos: number };

export type Drag =
  | (DragBase & {
      type: 'item';
      kind: ItemKind;
      fromDayId: number;
      target: DropTarget;
    })
  | (DragBase & { type: 'tray'; kind: 'place' | 'booking'; target: DropTarget })
  | (DragBase & { type: 'day'; fromIdx: number; target: { gap: number } })
  | (DragBase & {
      type: 'stay';
      stay: Stay;
      span0: Span;
      target: { span: Span };
    })
  | (DragBase & {
      type: 'transport';
      transport: Transport;
      target: { minutes: number };
    });

export interface State {
  tripId: string | null;
  model: Model | null;
  warnings: Warning[];
  caps: Partial<Capabilities>;
  readOnly: boolean;
  loading: boolean;
  error: string | null;
  zoom: Zoom;
  tab: Tab;
  trayOpen: boolean;
  showWarnings: boolean;
  bannerDismissed: boolean;
  lang: string;
  mobile: boolean;
  busy: boolean;
  drag: Drag | null;
  ownWriteAt: number;
  refreshTimer: number | undefined;
  refreshQueued: boolean;
}

export const S: State = {
  tripId: null,
  model: null,
  warnings: [],
  caps: {},
  readOnly: false,
  loading: true,
  error: null,
  zoom: 'm',
  tab: 'stays',
  trayOpen: true,
  showWarnings: false,
  bannerDismissed: false,
  lang: 'en',
  mobile: false,
  busy: false,
  drag: null,
  ownWriteAt: 0,
  refreshTimer: undefined,
  refreshQueued: false,
};

export const app = document.getElementById('app')!;

export const live = document.getElementById('ts-live')!;

/** The loaded model. Everything past render()'s early returns can rely on it. */
export function model(): Model {
  if (!S.model) throw new Error('the trip is not loaded');
  return S.model;
}

export function isZoom(v: unknown): v is Zoom {
  return v === 's' || v === 'm' || v === 'l';
}

export function isTab(v: unknown): v is Tab {
  return v === 'stays' || v === 'transport' || v === 'costs';
}

export function dw(): number {
  return ZOOM[S.zoom] || ZOOM.m;
}

let renderer: () => void = () => {};

/** Set once by view/index.ts, so the parts of the page can redraw without importing it. */
export function setRenderer(fn: () => void): void {
  renderer = fn;
}

/** Redraw the page from S. */
export function rerender(): void {
  renderer();
}
