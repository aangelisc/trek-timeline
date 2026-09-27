#!/usr/bin/env node
// Local sandbox: the SDK's own sandboxed-iframe preview, backed by an in-memory TREK
// (test/support/fake-trek.js) instead of the SDK's fixture store, so every gesture can
// be tried end to end. Extra over `trek-plugin-sdk dev`:
//   - the plugin methods proposed upstream can be switched on (days.reorder, …)
//   - writes change what the next read returns, like a real TREK
//   - core events reach the frame through trek.onEvent (live updates)
//   - a read-only switch, a "collaborator edit" button and a data reset
// It serves the built plugin (server/index.js, client/), the files TREK loads, and keeps
// them rebuilt from src/ while it runs.
//
//   npm run sandbox                     → http://localhost:4318
//   node scripts/sandbox.ts 4399 --no-watch   serve an existing build (the e2e tests)

import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PluginDefinition, PluginRequest } from 'trek-plugin-sdk';
import { injectTrekUi } from 'trek-plugin-sdk';
import type { TimelineCtx } from '../src/server/trek.ts';
import { TRIP_ID } from '../test/fixtures/trip.ts';
import type { FakeTrek } from '../test/support/fake-trek.ts';
import { createFakeTrek } from '../test/support/fake-trek.ts';
import MANIFEST from '../trek-plugin.json' with { type: 'json' };
import { watch } from './build.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const PORT = Number(process.env.PORT || args.find((a) => /^\d+$/.test(a)) || 4318);
const require = createRequire(import.meta.url);
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

// ---- state ---------------------------------------------------------------------------

const config = { upstream: true, readOnly: false };
let events: { seq: number; event: string; tripId: number }[] = [];
let seq = 0;
let fake: FakeTrek;

function reset() {
  fake = createFakeTrek({
    upstream: config.upstream,
    onEvent: (event, tripId) => events.push({ seq: ++seq, event, tripId }),
  });
  events = events.slice(-50);
}
reset();

/** The ctx a route sees: the fake TREK, with writes refused when read-only is on. */
function routeCtx(): TimelineCtx {
  if (!config.readOnly) return fake.ctx;
  const deny = () => {
    throw new Error('RESOURCE_FORBIDDEN: trip_edit denied (sandbox read-only)');
  };
  const ro: Record<string, Record<string, unknown>> = {};
  for (const [ns, api] of Object.entries(fake.ctx)) {
    ro[ns] = {};
    for (const [fn, impl] of Object.entries(api as Record<string, unknown>)) {
      const read = ns === 'trips' || ns === 'costs' || ns === 'settings' || ns === 'log';
      ro[ns][fn] = read || typeof impl !== 'function' ? impl : deny;
    }
  }
  return ro as unknown as TimelineCtx;
}

// ---- hot reload of the built server/ and client/ -------------------------------------------

function newestMtime(dir: string): number {
  let max = 0;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    max = Math.max(max, f.isDirectory() ? newestMtime(p) : fs.statSync(p).mtimeMs);
  }
  return max;
}

let serverStamp = 0;
let plugin: PluginDefinition | undefined;
function loadPlugin(): PluginDefinition {
  const stamp = newestMtime(path.join(ROOT, 'server'));
  if (plugin && stamp === serverStamp) return plugin;
  for (const k of Object.keys(require.cache)) if (k.startsWith(path.join(ROOT, 'server'))) delete require.cache[k];
  plugin = require('../server/index.js') as PluginDefinition;
  serverStamp = stamp;
  return plugin;
}

// ---- host page ------------------------------------------------------------------------------

// Added to the SDK preview page: sandbox controls, a form-factor switch (the preview
// has none), a wider stage for a trip-page, and event delivery into the frame.
const EXTRA = `
<style>.wrap{max-width:none!important} .stage{padding:20px 16px!important} .sbx{display:flex;gap:14px;flex-wrap:wrap;align-items:center;padding:8px 16px;
border-bottom:1px solid #e5e7eb;font-size:12.5px;background:#fffbeb} body.dark .sbx{background:#1c1917;border-color:#27272a}</style>
<script>
(function(){
  var bar=document.createElement('div'); bar.className='sbx';
  bar.innerHTML='<b>Sandbox</b>'+
    '<label><input type="checkbox" id="sbx-up"> upstream plugin API (days.reorder, itinerary.move…)</label>'+
    '<label><input type="checkbox" id="sbx-ro"> read-only member</label>'+
    '<label><input type="checkbox" id="sbx-mob"> mobile</label>'+
    '<button id="sbx-collab">Simulate a collaborator edit</button>'+
    '<button id="sbx-reset">Reset data</button><span id="sbx-msg" style="opacity:.6"></span>';
  document.body.insertBefore(bar, document.querySelector('.stage'));
  var up=document.getElementById('sbx-up'), ro=document.getElementById('sbx-ro'), mob=document.getElementById('sbx-mob');
  function cfg(body){ return fetch('/__sandbox/config',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json();}); }
  cfg({}).then(function(c){ up.checked=c.upstream; ro.checked=c.readOnly; });
  function reload(){ document.getElementById('f').src='/ui/index.html'; }
  up.onchange=function(){ cfg({upstream:up.checked, reset:true}).then(reload); };
  ro.onchange=function(){ cfg({readOnly:ro.checked}).then(reload); };
  document.getElementById('sbx-reset').onclick=function(){ cfg({reset:true}).then(reload); };
  document.getElementById('sbx-collab').onclick=function(){
    fetch('/__sandbox/collab',{method:'POST'}).then(function(r){return r.json();}).then(function(x){ document.getElementById('sbx-msg').textContent=x.message; });
  };
  var baseCtx=window.ctx;
  window.ctx=function(){ var c=baseCtx(); c.viewport={formFactor:mob.checked?'mobile':'desktop',surface:'page',fill:true}; return c; };
  mob.onchange=function(){ document.querySelector('.wrap').style.maxWidth=mob.checked?'420px':''; postCtx(); };
  var after=0;
  setInterval(function(){
    fetch('/__sandbox/events?after='+after).then(function(r){return r.json();}).then(function(list){
      list.forEach(function(e){ after=e.seq; document.getElementById('f').contentWindow.postMessage({type:'trek:event',event:e.event,tripId:e.tripId},'*'); });
    }).catch(function(){});
  },700);
})();
</script>`;

const SHOT_EXTRA =
  '<style>.wrap{max-width:none!important}.stage{padding:24px 28px!important;align-items:flex-start!important}</style>';

type Preview = (id: string, type: string, tripId: number, opts: { chrome: boolean }) => string;
let previewFn: Preview | undefined;
async function hostPage(shot: boolean): Promise<string> {
  const preview: Preview = (previewFn ??= (
    await import(path.join(ROOT, 'node_modules/trek-plugin-sdk/dist/cli/dev.js'))
  ).preview);
  // ?shot=1 is the store-card framing (`npm run shot`): no dev or sandbox chrome.
  const html = preview(MANIFEST.id, MANIFEST.type, TRIP_ID, { chrome: !shot });
  return html.replace('</body>', `${shot ? SHOT_EXTRA : EXTRA}</body>`);
}

// ---- collaborator simulation ---------------------------------------------------------------

let collabTurn = 0;
function collaboratorEdit(): string {
  const s = fake.state;
  const turn = collabTurn++ % 3;
  if (turn === 0) {
    const day = s.days[Math.floor(Math.random() * s.days.length)];
    day.title = day.title ? null : 'Edited by Sam';
    events.push({ seq: ++seq, event: 'day:updated', tripId: TRIP_ID });
    return `Sam ${day.title ? 'titled' : 'cleared the title of'} day ${day.day_number}`;
  }
  if (turn === 1) {
    const stay = s.accommodations[0];
    stay.check_out = stay.check_out === '11:00' ? '12:00' : '11:00';
    events.push({
      seq: ++seq,
      event: 'accommodation:updated',
      tripId: TRIP_ID,
    });
    return `Sam changed check-out to ${stay.check_out}`;
  }
  const d = s.days[3];
  (d.notes_items ??= []).push({
    id: 5000 + seq,
    day_id: d.id,
    text: 'Sam: bring umbrellas',
    time: null,
    sort_order: 99,
  });
  events.push({ seq: ++seq, event: 'dayNote:created', tripId: TRIP_ID });
  return `Sam added a note to day ${d.day_number}`;
}

// ---- http ----------------------------------------------------------------------------------------

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : null);
      } catch {
        resolve(data);
      }
    });
  });
}

function send(res: http.ServerResponse, status: number, body: unknown, type = 'application/json'): void {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  try {
    if (url.pathname === '/' || url.pathname === '/preview') {
      return send(res, 200, await hostPage(url.searchParams.get('shot') === '1'), TYPES['.html']);
    }
    if (url.pathname === '/__dev/version') {
      return send(
        res,
        200,
        String(newestMtime(path.join(ROOT, 'client')) + newestMtime(path.join(ROOT, 'server'))),
        'text/plain',
      );
    }
    if (url.pathname === '/__sandbox/config' && req.method === 'POST') {
      const b = ((await readBody(req)) || {}) as {
        upstream?: unknown;
        readOnly?: unknown;
        reset?: unknown;
      };
      if (typeof b.upstream === 'boolean') config.upstream = b.upstream;
      if (typeof b.readOnly === 'boolean') config.readOnly = b.readOnly;
      if (b.reset) reset();
      return send(res, 200, config);
    }
    if (url.pathname === '/__sandbox/events') {
      const after = Number(url.searchParams.get('after') || 0);
      return send(
        res,
        200,
        events.filter((e) => e.seq > after),
      );
    }
    if (url.pathname === '/__sandbox/collab' && req.method === 'POST')
      return send(res, 200, { message: collaboratorEdit() });
    if (url.pathname === '/__sandbox/state') return send(res, 200, fake.state);

    if (url.pathname.startsWith('/ui/')) {
      const rel = url.pathname.slice(4) || 'index.html';
      const file = path.join(ROOT, 'client', rel);
      if (!file.startsWith(path.join(ROOT, 'client')) || !fs.existsSync(file))
        return send(res, 404, 'not found', 'text/plain');
      const type = TYPES[path.extname(file)] || 'application/octet-stream';
      const raw = fs.readFileSync(file);
      return send(res, 200, type.startsWith('text/html') ? injectTrekUi(String(raw)) : raw, type);
    }

    if (url.pathname.startsWith('/api/')) {
      const p = loadPlugin();
      const sub = url.pathname.slice(4);
      const route = (p.routes || []).find((r) => r.method === req.method && r.path === sub);
      if (!route) return send(res, 404, { error: `no ${req.method} route ${sub}` });
      const query = Object.fromEntries(url.searchParams.entries());
      const request: PluginRequest = {
        method: req.method || 'GET',
        path: sub,
        query,
        body: await readBody(req),
        headers: {},
        user: { id: 1, username: 'dev', isAdmin: false },
      };
      // The fake TREK covers what this plugin calls, not the whole PluginContext.
      const r = await route.handler(request, routeCtx() as unknown as Parameters<typeof route.handler>[1]);
      return send(res, r.status || 200, r.body, (r.headers && r.headers['content-type']) || 'application/json');
    }
    send(res, 404, 'not found', 'text/plain');
  } catch (err) {
    console.error(err);
    send(res, 500, { error: String(err instanceof Error ? err.message : err) });
  }
});

if (!args.includes('--no-watch')) await watch();

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Trek Timeline sandbox → http://localhost:${PORT}\n`);
  console.log('  In-memory TREK with the fixture trip. Edits under src/ rebuild and reload.');
  console.log('  Ctrl+C to stop.\n');
});
