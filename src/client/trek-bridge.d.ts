// The frame's bridge to TREK, `window.trek`, installed by the design kit that the
// `<!-- trek:ui -->` marker injects. The SDK ships it as a script string only, so the
// parts this page uses are typed here from its source (trek-plugin-sdk/dist/ui/kit.js).

interface TrekFrameContext {
  tripId?: number | string | null;
  locale?: string;
  theme?: string;
  dir?: 'ltr' | 'rtl';
  viewport?: {
    formFactor?: 'mobile' | 'desktop' | (string & {});
    surface?: string;
    fill?: boolean;
  };
}

interface TrekConfirmOptions {
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface TrekSessionOptions {
  /** 'trip' keys are per trip; 'plugin' keys are shared across trips. */
  scope?: 'plugin' | 'trip';
}

interface TrekBridge {
  context: TrekFrameContext | null;
  /** Call one of this plugin's routes. A non-2xx answer rejects with the status only. */
  invoke<T = unknown>(sub: string, opts?: { method?: string; body?: unknown }): Promise<T>;
  onContext(cb: (ctx: TrekFrameContext) => void): () => void;
  /** Core event names for the trip in view; no payloads, so refetch. */
  onEvent(cb: (event: string, tripId: number | string) => void): () => void;
  /** The host's confirm dialog. A second one while the first is open resolves false. */
  confirm(opts: string | TrekConfirmOptions): Promise<boolean>;
  notify(level: 'info' | 'success' | 'warning' | 'error', message: string, duration?: number): void;
  navigate(to: string): void;
  openExternal(url: string): void;
  /** Per-tab storage: 32 keys, 1 KiB per value. */
  session: {
    get(key: string, opts?: TrekSessionOptions): Promise<unknown>;
    set(key: string, value: unknown, opts?: TrekSessionOptions): Promise<void>;
    remove(key: string, opts?: TrekSessionOptions): Promise<void>;
    clear(opts?: TrekSessionOptions): Promise<void>;
  };
}

declare const trek: TrekBridge;
