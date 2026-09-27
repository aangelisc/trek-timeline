// Which gestures this TREK allows (see Capabilities).
import type { ItemKind } from '../shared/types.ts';
import { S } from './state.ts';

export function canDropItem(kind: ItemKind, sameDay: boolean): boolean {
  if (kind === 'booking') return true;
  if (kind === 'note') return sameDay || !!S.caps.moveNotes;
  return sameDay ? !!S.caps.reorderItems : !!S.caps.moveItems;
}

export function itemLockReason(kind: ItemKind): string | null {
  if (kind === 'place' && !S.caps.moveItems && !S.caps.reorderItems) return 'Moving places needs a newer TREK';
  return null;
}
