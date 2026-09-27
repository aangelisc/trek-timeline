import type { Costs, ModelDay, Stay } from '../../shared/types.ts';
import { datePart } from '../time.ts';
import type { RawCost, RawReservation } from '../trek.ts';
import type { Lookup } from './lookup.ts';

/**
 * Cost of a budget item in the trip currency. TREK freezes `exchange_rate` at entry;
 * it is taken as item currency -> trip currency, and an item without one is summed as-is.
 */
export function costInTripCurrency(item: RawCost, currency: string | null): number {
  const v = Number(item.total_price) || 0;
  if (!item.currency || !currency || item.currency === currency) return v;
  return item.exchange_rate ? v * item.exchange_rate : v;
}

/** Totals in the trip currency, overall, per category and per booking. */
export interface CostTally {
  total: number;
  byCategory: Map<string, number>;
  byReservation: Map<number, number>;
}

export function tallyCosts(costs: RawCost[], currency: string | null): CostTally {
  const byReservation = new Map<number, number>();
  const byCategory = new Map<string, number>();
  let total = 0;
  for (const c of costs) {
    const v = costInTripCurrency(c, currency);
    total += v;
    const cat = c.category || 'Other';
    byCategory.set(cat, (byCategory.get(cat) || 0) + v);
    if (c.reservation_id != null) byReservation.set(c.reservation_id, (byReservation.get(c.reservation_id) || 0) + v);
  }
  return { total, byCategory, byReservation };
}

/**
 * Costs per day, written onto `days`: the expense date first, then the day of the
 * booking it pays for, then the first day its place is planned on. Returns the rest,
 * which is shown as unallocated.
 */
export function allocateCosts(
  costs: RawCost[],
  currency: string | null,
  lookup: Lookup,
  reservations: RawReservation[],
  stays: Stay[],
  days: ModelDay[],
): number {
  const dayCost = new Map(days.map((d) => [d.id, 0]));
  const reservationDay = new Map<number, number>();
  for (const r of reservations) if (r.day_id != null) reservationDay.set(r.id, r.day_id);
  for (const s of stays) if (s.reservationId != null) reservationDay.set(s.reservationId, s.startDayId);
  const placeDay = new Map<number, number>();
  for (const d of days) {
    for (const it of d.items) if (it.kind === 'place' && !placeDay.has(it.placeId)) placeDay.set(it.placeId, d.id);
  }
  let unallocated = 0;
  for (const c of costs) {
    const v = costInTripCurrency(c, currency);
    let dayId = (c.expense_date ? lookup.dayOnDate(datePart(c.expense_date))?.id : null) ?? null;
    if (dayId == null && c.reservation_id != null) dayId = reservationDay.get(c.reservation_id) ?? null;
    if (dayId == null && c.place_id != null) dayId = placeDay.get(c.place_id) ?? null;
    if (dayId != null && dayCost.has(dayId)) dayCost.set(dayId, dayCost.get(dayId)! + v);
    else unallocated += v;
  }
  for (const d of days) d.cost = round2(dayCost.get(d.id) || 0);
  return unallocated;
}

export function costSummary(tally: CostTally, unallocated: number, currency: string | null, available: boolean): Costs {
  return {
    available,
    currency,
    total: round2(tally.total),
    unallocated: round2(unallocated),
    byCategory: [...tally.byCategory.entries()]
      .map(([category, v]) => ({ category, total: round2(v) }))
      .sort((a, b) => b.total - a.total),
  };
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
