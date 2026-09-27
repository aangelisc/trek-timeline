import type { OperationArgs } from '../../shared/types.ts';
import { fail } from './errors.ts';
import { label, listed, requireCap } from './helpers.ts';
import type { PlanInput, PlanPart } from './types.ts';

/** Reorder whole days. TREK keeps each date on its position, so days take new dates. */
export function reorderDays(
  { model, tripId, caps }: PlanInput,
  { orderedIds }: OperationArgs['reorderDays'],
): PlanPart {
  requireCap(caps, 'reorderDays', 'Reordering days');
  const ids = (orderedIds || []).map(Number);
  const current = model.days.map((d) => d.id);
  if (ids.length !== current.length || new Set(ids).size !== ids.length || !ids.every((id) => current.includes(id))) {
    fail('orderedIds must list every day of the trip exactly once');
  }
  if (ids.every((id, i) => id === current[i])) return { calls: [], summary: ['Nothing changes.'] };

  const newIndex = new Map(ids.map((id, i) => [id, i]));
  const dates = model.days.flatMap((d) => (d.date ? [d.date] : [])).sort();
  const newDate = (id: number | null) => (model.trip.dated && id != null ? (dates[newIndex.get(id)!] ?? null) : null);

  const summary: string[] = [];
  const moved = model.days
    .filter((d) => newIndex.get(d.id) !== d.index)
    .map(
      (d) =>
        `${d.title || label(d)} becomes day ${newIndex.get(d.id)! + 1}${newDate(d.id) ? ` (${newDate(d.id)})` : ''}.`,
    );
  summary.push(...listed(moved));

  // Bookings on a day that changes date are re-dated by TREK, time of day kept.
  const redated: string[] = [];
  if (model.trip.dated) {
    const changed = new Set(model.days.filter((d) => d.date !== newDate(d.id)).map((d) => d.id));
    for (const d of model.days) {
      if (!changed.has(d.id)) continue;
      for (const it of d.items) if (it.kind === 'booking') redated.push(`${it.title} → ${newDate(d.id)}`);
    }
    for (const t of model.transport)
      if (t.dayId != null && changed.has(t.dayId)) redated.push(`${t.title} → ${newDate(t.dayId)}`);
  }
  if (redated.length)
    summary.push(`${redated.length} booking${redated.length === 1 ? '' : 's'} get a new date:`, ...listed(redated));

  const stayLines: string[] = [];
  for (const s of model.stays) {
    if (s.startIndex == null || s.endIndex == null) continue;
    const a = newIndex.get(s.startDayId)!;
    const b = newIndex.get(s.endDayId)!;
    if (a > b) fail(`This would make ${s.title} check out before it checks in.`, 409);
    if (b - a !== s.nights) stayLines.push(`${s.title}: ${s.nights} → ${b - a} night${b - a === 1 ? '' : 's'}`);
  }
  if (stayLines.length) summary.push('Stays change length:', ...stayLines);

  return {
    destructive: redated.length > 0 || stayLines.length > 0,
    summary,
    calls: [{ method: 'days.reorder', args: [tripId, ids] }],
  };
}
