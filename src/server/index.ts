// Plugin entry. Runs in TREK's isolated child process, bundled to server/index.js.
import type { PluginResponse } from 'trek-plugin-sdk';
import { definePlugin } from 'trek-plugin-sdk';
import type {
  DryRunResponse,
  Failure,
  OperationRequest,
  OpResponse,
  TimelinePayload,
  TimelineResponse,
} from '../shared/types.ts';
import { loadTrip, warningOptions } from './load.ts';
import { applyPlan, capabilities, OpError, planOp } from './operations/index.ts';
import type { TimelineCtx } from './trek.ts';
import { computeWarnings, toTripWarnings } from './warnings.ts';

function json(status: number, body: TimelineResponse | DryRunResponse | OpResponse | Failure): PluginResponse {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function tripIdOf(v: unknown): number {
  const id = Number(v);
  if (!Number.isInteger(id) || id <= 0) throw new OpError('tripId is required', 400);
  return id;
}

function parseBody(body: unknown): Partial<OperationRequest> {
  if (body == null) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body as Partial<OperationRequest>;
}

/**
 * Map a thrown error to a response. Expected failures answer HTTP 200 with
 * `{ ok: false, status, error }`: TREK's bridge rejects a non-2xx invoke with only the
 * status code, so the reason would never reach the page. Host refusals become status
 * 403 with `readOnly` so the UI stops offering edits.
 */
function errorResponse(err: unknown, ctx: TimelineCtx): PluginResponse {
  const msg = String((err instanceof Error && err.message) || err);
  const known = (err as { status?: unknown } | null)?.status;
  const status = typeof known === 'number' ? known : null;
  if (/PERMISSION_DENIED|RESOURCE_FORBIDDEN|forbidden|not allowed/i.test(msg) && !status) {
    return json(200, { ok: false, status: 403, error: msg, readOnly: true });
  }
  if (!status || (status >= 500 && status !== 501)) {
    ctx.log.error('trek-timeline route failed', { error: msg });
    return json(500, { ok: false, status: status || 500, error: msg });
  }
  return json(200, { ok: false, status, error: msg });
}

async function timeline(ctx: TimelineCtx, tripId: number): Promise<TimelinePayload> {
  const { model } = await loadTrip(ctx, tripId);
  return {
    model,
    warnings: computeWarnings(model, await warningOptions(ctx)),
    capabilities: capabilities(ctx),
  };
}

export default definePlugin({
  routes: [
    {
      method: 'GET',
      path: '/timeline',
      auth: true,
      async handler(req, ctx) {
        try {
          return json(200, {
            ok: true,
            ...(await timeline(ctx, tripIdOf(req.query.tripId))),
          });
        } catch (err) {
          return errorResponse(err, ctx);
        }
      },
    },
    {
      // { tripId, op, args, dryRun } — dryRun returns the impact without writing.
      method: 'POST',
      path: '/op',
      auth: true,
      async handler(req, ctx) {
        try {
          const body = parseBody(req.body);
          const tripId = tripIdOf(body.tripId);
          const snapshot = await loadTrip(ctx, tripId);
          const plan = planOp(snapshot, tripId, body.op, body.args, capabilities(ctx));
          const impact = {
            destructive: plan.destructive,
            summary: plan.summary,
            noop: plan.calls.length === 0,
          };
          if (body.dryRun) return json(200, { ok: true, impact });
          await applyPlan(ctx, plan);
          return json(200, {
            ok: true,
            impact,
            ...(await timeline(ctx, tripId)),
          });
        } catch (err) {
          return errorResponse(err, ctx);
        }
      },
    },
  ],
  hooks: {
    warningProvider: {
      async getWarnings(tripId, ctx) {
        const { model } = await loadTrip(ctx, tripId);
        return toTripWarnings(computeWarnings(model, await warningOptions(ctx)));
      },
    },
  },
});
