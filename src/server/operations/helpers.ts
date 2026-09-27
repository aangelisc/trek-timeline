import type { Capabilities, Model, ModelDay } from '../../shared/types.ts';
import type { Snapshot } from '../load.ts';
import type { RawEndpoint, RawReservation } from '../trek.ts';
import { fail } from './errors.ts';
import type { EndpointInput } from './types.ts';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const MAX_LISTED = 6;

export function dayById(model: Model, id: unknown): ModelDay {
  const d = model.days.find((x) => x.id === Number(id));
  if (!d) fail(`no day ${id} on this trip`);
  return d;
}

export function bookingById(raw: Snapshot['raw'], id: unknown): RawReservation {
  const r = (raw.reservations || []).find((x) => x.id === Number(id));
  if (!r) fail(`no booking ${id} on this trip`);
  return r;
}

export function label(d: ModelDay): string {
  return `Day ${d.number}${d.date ? ` (${d.date})` : ''}`;
}

export function listed(lines: string[]): string[] {
  return lines.length <= MAX_LISTED ? lines : [...lines.slice(0, MAX_LISTED), `…and ${lines.length - MAX_LISTED} more`];
}

export function requireCap(caps: Capabilities, key: keyof Capabilities, what: string): void {
  if (!caps[key]) fail(`${what} needs a newer TREK (the plugin API can't do this yet)`, 501);
}

/** A leg to send back to TREK: endpoints are replaced wholesale and their ids aren't stable. */
export function endpointInput(e: RawEndpoint, over: Partial<EndpointInput> = {}): EndpointInput {
  return {
    role: e.role,
    name: e.name,
    lat: e.lat ?? null,
    lng: e.lng ?? null,
    sequence: e.sequence ?? null,
    code: e.code ?? null,
    timezone: e.timezone ?? null,
    local_time: e.local_time ?? null,
    local_date: e.local_date ?? null,
    ...over,
  };
}

export function fmtMinutes(m: number): string {
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  return [d ? `${d}d` : '', h ? `${h}h` : '', mm ? `${mm}m` : ''].filter(Boolean).join(' ');
}

export function cleanText(v: unknown, max: number): string | null {
  if (v == null || v === '') return null;
  if (typeof v !== 'string') fail('expected text');
  return v.trim().slice(0, max);
}

export function cleanTime(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v !== 'string' || !HHMM.test(v)) fail(`"${String(v)}" is not a time (HH:MM)`);
  return v;
}
