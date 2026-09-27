import type { Capabilities, OperationName } from '../../shared/types.ts';
import type { Snapshot } from '../load.ts';
import type { RawEndpoint } from '../trek.ts';

export type Input = Record<string, unknown>;

export type EndpointInput = Omit<RawEndpoint, 'id' | 'reservation_id'>;

/** One ctx call a plan makes. */
export type Call =
  | { method: 'days.reorder'; args: [tripId: number, orderedDayIds: number[]] }
  | {
      method: 'itinerary.assign';
      args: [tripId: number, dayId: number, placeId: number];
    }
  | {
      method: 'itinerary.move';
      args: [tripId: number, assignmentId: number, toDayId: number, orderIndex: number];
    }
  | {
      method: 'itinerary.reorder';
      args: [tripId: number, dayId: number, orderedAssignmentIds: number[]];
    }
  | {
      method: 'daynotes.update';
      args: [tripId: number, dayId: number, noteId: number, input: Input];
    }
  | {
      method: 'daynotes.move';
      args: [tripId: number, noteId: number, fromDayId: number, toDayId: number, sortOrder: number];
    }
  | {
      method: 'accommodations.update';
      args: [tripId: number, stayId: number, input: Input];
    }
  | {
      method: 'reservations.update';
      args: [tripId: number, reservationId: number, input: Input];
    };

/** What a planner returns: the calls, and what the user should know first. */
export interface PlanPart {
  calls: Call[];
  summary?: string[];
  destructive?: boolean;
}

export interface Plan {
  op: OperationName;
  destructive: boolean;
  summary: string[];
  calls: Call[];
}

export interface PlanInput extends Snapshot {
  tripId: number;
  caps: Capabilities;
}
