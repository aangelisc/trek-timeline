// Seed a rich demo trip into a local TREK instance so the plugin has plenty to show:
// a 3-week itinerary with every transport type, several stays (and one deliberate gap),
// a few activities on every day, some day notes, and a spread of costs.
//
//   node scripts/seed-demo.mjs <baseUrl> <containerName> <email> <password>
//
// Called by test-local.sh after the plugin is installed; safe to run on its own too.
// It no-ops if the demo trip already exists. The container name is only needed because
// reservation endpoints (the from/to of a journey) have no public create route, so they
// are inserted straight into TREK's SQLite.
import { execFileSync } from 'node:child_process';

const [BASE, CONTAINER, EMAIL, PASS] = process.argv.slice(2);
const TRIP_TITLE = 'Demo trip';
const START = '2026-11-01';
const DAYS = 21; // three weeks

const iso = (dayIdx) => {
  const d = new Date(START + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dayIdx);
  return d.toISOString().slice(0, 10);
};

let TOKEN = '';
async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(TOKEN ? { authorization: 'Bearer ' + TOKEN } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  return json;
}
const idOf = (j) => (j.trip || j.reservation || j.place || j.assignment || j.accommodation || j.note || j.item || j).id;

// --- the itinerary -----------------------------------------------------------------------
// Each transport is one of the plugin's recognised types; together they cover all of them.
const TRANSPORT = [
  ['flight', 'BA5 London → Tokyo', 'LHR', 'HND', 0, 1, '11:30', '08:00'],
  ['train', 'Shinkansen Tokyo → Kyoto', 'Tokyo', 'Kyoto', 4, 4, '09:00', '11:15'],
  ['bus', 'Highway bus Kyoto → Osaka', 'Kyoto', 'Osaka', 7, 7, '13:00', '14:10'],
  ['ferry', 'Overnight ferry Osaka → Beppu', 'Osaka', 'Beppu', 9, 10, '19:00', '06:20'],
  ['cruise', 'Inland Sea cruise', 'Beppu', 'Kobe', 11, 12, '16:00', '08:00'],
  ['car', 'Day drive to Mt Aso', 'Kobe', 'Kobe', 13, 13, '09:00', '17:30'],
  ['rental_car', 'Car rental', 'Kobe', 'Hiroshima', 14, 16, '10:00', '18:00'],
  ['taxi', 'Airport taxi', 'Hotel', 'HIJ', 17, 17, '06:30', '07:15'],
  ['transfer', 'Hotel shuttle', 'HND', 'Shinjuku', 18, 18, '14:00', '14:45'],
  ['transport', 'Metro day pass', 'Shinjuku', 'Ueno', 19, 19, '10:00', '10:40'],
  ['flight', 'BA6 Tokyo → London', 'HND', 'LHR', 20, 20, '11:00', '15:30'],
  // Deliberately overlapping journeys, to show how the lane stacks them into rows:
  // three ways out of the airport on arrival morning (day 2)...
  ['train', 'Airport express HND → Shinjuku', 'HND', 'Shinjuku', 1, 1, '08:30', '09:20'],
  ['taxi', 'Backup taxi HND → hotel', 'HND', 'Hotel', 1, 1, '08:45', '09:45'],
  ['bus', 'Limousine bus HND → city', 'HND', 'City Air Terminal', 1, 1, '09:00', '10:05'],
  // ...and a short hop that overlaps the multi-day car rental (days 15-17).
  ['ferry', 'Miyajima day ferry', 'Hiroshima', 'Miyajima', 15, 15, '10:00', '10:45'],
];

// name, startDayIdx, endDayIdx(checkout), checkIn, checkInEnd, checkOut. Nights 8-9 are left
// uncovered on purpose so the plugin raises a "no accommodation" warning.
const STAYS = [
  ['Shinjuku Granbell Hotel', 0, 4, '15:00', '22:00', '10:00'],
  ['Kyoto Machiya Ryokan', 4, 7, '16:00', '21:00', '10:00'],
  ['Osaka Bay Hotel', 9, 13, '15:00', '23:00', '11:00'],
  ['Kobe Harborland Inn', 13, 16, '15:00', '22:00', '10:00'],
  ['Hiroshima Peace Hotel', 16, 18, '14:00', '22:00', '10:00'],
  ['Tokyo Station Hotel', 18, 20, '15:00', '23:00', '11:00'],
];

// Pool of activities cycled across the days (3 per day) so every day looks full.
const ACTIVITIES = [
  'Senso-ji Temple',
  'Meiji Shrine',
  'Shibuya Crossing',
  'teamLab Planets',
  'Tsukiji Market',
  'Ueno Park',
  'Akihabara electronics',
  'Shinjuku Gyoen',
  'Golden Gai bars',
  'Tokyo Skytree',
  'Fushimi Inari shrine',
  'Kinkaku-ji',
  'Arashiyama bamboo grove',
  'Nishiki Market',
  'Gion walk',
  'Osaka Castle',
  'Dotonbori street food',
  'Kuromon Market',
  'Umeda Sky Building',
  'Aquarium Kaiyukan',
  'Beppu hot springs',
  'Mt Aso crater',
  'Himeji Castle',
  'Kobe beef dinner',
  'Sake brewery tour',
  'Miyajima Island',
  'Peace Memorial Park',
  'Okonomiyaki lunch',
  'Shukkeien Garden',
  'Onsen evening',
  'Ramen tasting',
  'Calligraphy class',
  'Tea ceremony',
  'Kimono fitting',
  'Cycling tour',
  'Night photography walk',
  'Local cooking class',
  'Flea market browse',
  'Botanical garden',
  'Observation deck',
];

const NOTES = [
  [0, 'Pick up pocket Wi-Fi at the airport', '09:30', 'info'],
  [4, 'Activate the JR Pass before boarding', '08:15', 'alert'],
  [7, 'Luggage forwarding to Osaka hotel', '11:00', 'info'],
  [9, 'No hotel tonight — overnight ferry', '18:00', 'alert'],
  [14, 'Collect the rental car, IDP required', '09:30', 'info'],
  [20, 'Check out early, flight at 11:00', '07:00', 'alert'],
];

// General costs not tied to a single journey, stay or activity. Per-item costs for the
// transports, stays and activities are generated and linked in main().
const COSTS = [
  ['Travel insurance', 'other', 90, 'GBP'],
  ['Pocket Wi-Fi rental', 'other', 55, 'GBP'],
  ['SIM / data', 'other', 20, 'GBP'],
  ['Street food budget', 'food', 200, 'GBP'],
  ['Souvenirs', 'shopping', 150, 'GBP'],
  ['Konbini snacks (¥)', 'food', 18000, 'JPY'],
  ['Spending cash (¥)', 'other', 50000, 'JPY'],
];

async function main() {
  const login = await call('POST', '/api/auth/login', { email: EMAIL, password: PASS });
  TOKEN = login.token;

  const trips = await call('GET', '/api/trips');
  if ((trips.trips || trips).some((t) => t.title === TRIP_TITLE)) {
    console.log(`"${TRIP_TITLE}" already exists — skipping seed.`);
    return;
  }

  const trip = await call('POST', '/api/trips', {
    title: TRIP_TITLE,
    start_date: START,
    end_date: iso(DAYS - 1),
    currency: 'GBP',
  });
  const TID = idOf(trip);
  const days = (await call('GET', `/api/trips/${TID}/days`)).days.sort((a, b) => a.day_number - b.day_number);
  const D = days.map((d) => d.id);

  // Transports, then their endpoints in one SQLite batch (no public endpoint API). Keep each
  // reservation id so a matching cost can be attached to the journey.
  const TRANSPORT_PRICE = {
    flight: 840,
    train: 120,
    bus: 25,
    ferry: 95,
    cruise: 180,
    car: 60,
    rental_car: 240,
    taxi: 18,
    transfer: 15,
    transport: 12,
  };
  const epStmts = [];
  const journeys = [];
  for (const [type, title, from, to, s, e, dep, arr] of TRANSPORT) {
    const r = await call('POST', `/api/trips/${TID}/reservations`, {
      type,
      title,
      reservation_time: `${iso(s)}T${dep}`,
      reservation_end_time: `${iso(e)}T${arr}`,
      day_id: D[s],
      end_day_id: D[e],
    });
    const rid = idOf(r);
    journeys.push({ rid, title, price: TRANSPORT_PRICE[type] ?? 40 });
    epStmts.push(`i.run(${rid},'from',0,${JSON.stringify(from)},'',0,0,'${dep}','${iso(s)}')`);
    epStmts.push(`i.run(${rid},'to',1,${JSON.stringify(to)},'',0,0,'${arr}','${iso(e)}')`);
  }
  execFileSync('docker', [
    'exec',
    CONTAINER,
    'node',
    '-e',
    `const db=require('/app/node_modules/better-sqlite3')('/app/data/travel.db');` +
      `const i=db.prepare('INSERT INTO reservation_endpoints (reservation_id,role,sequence,name,code,lat,lng,local_time,local_date) VALUES (?,?,?,?,?,?,?,?,?)');` +
      epStmts.join(';') +
      ';',
  ]);

  // Stays (each needs a place), with nights 8-9 left uncovered. Keep each accommodation id to
  // find its auto-created hotel booking, so a cost can be attached to the stay.
  const STAY_PRICE = [720, 660, 540, 420, 260, 480];
  const stays = [];
  for (let n = 0; n < STAYS.length; n++) {
    const [name, s, e, ci, ciEnd, co] = STAYS[n];
    const place = await call('POST', `/api/trips/${TID}/places`, { name });
    const acc = await call('POST', `/api/trips/${TID}/accommodations`, {
      place_id: idOf(place),
      start_day_id: D[s],
      end_day_id: D[e],
      check_in: ci,
      check_in_end: ciEnd,
      check_out: co,
      confirmation: 'CONF-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
    });
    stays.push({ accId: idOf(acc), name, price: STAY_PRICE[n] ?? 300 });
  }
  // Map each accommodation to the hotel booking TREK creates for it, so stay costs can link.
  const reservations = (await call('GET', `/api/trips/${TID}/reservations`)).reservations || [];
  const resByAcc = new Map(
    reservations.filter((r) => r.accommodation_id != null).map((r) => [r.accommodation_id, r.id]),
  );

  // Three activities on every day so days read as full. Keep the place ids so some activities
  // can carry a cost.
  let a = 0;
  const times = ['09:30', '12:30', '15:30'];
  const activityPlaces = [];
  for (let day = 0; day < DAYS; day++) {
    for (let k = 0; k < 3; k++) {
      const name = ACTIVITIES[a % ACTIVITIES.length];
      a++;
      const place = await call('POST', `/api/trips/${TID}/places`, { name });
      await call('POST', `/api/trips/${TID}/days/${D[day]}/assignments`, {
        place_id: idOf(place),
        order_index: k,
        place_time: times[k],
      });
      activityPlaces.push({ pid: idOf(place), name });
    }
  }

  for (const [day, text, time, icon] of NOTES) {
    await call('POST', `/api/trips/${TID}/days/${D[day]}/notes`, { text, time, icon, color: '#2563eb' });
  }

  // Costs. The budget API ignores reservation_id/place_id on create, so create each item then
  // link it with one SQLite update — giving every journey, stay and many activities its own cost.
  const linkUpd = [];
  const addCost = async (name, category, total_price, currency, link) => {
    const r = await call('POST', `/api/trips/${TID}/budget`, {
      name,
      category,
      total_price,
      currency,
      ...(currency === 'JPY' ? { exchange_rate: 0.0053 } : {}),
    });
    if (link)
      linkUpd.push(`db.prepare('UPDATE budget_items SET ${link.col}=? WHERE id=?').run(${link.val},${idOf(r)})`);
  };

  for (const j of journeys) await addCost(j.title, 'transport', j.price, 'GBP', { col: 'reservation_id', val: j.rid });
  for (const st of stays) {
    const rid = resByAcc.get(st.accId);
    await addCost(st.name, 'accommodation', st.price, 'GBP', rid ? { col: 'reservation_id', val: rid } : null);
  }
  const ACTIVITY_PRICE = [48, 16, 55, 40, 32, 25, 18, 60, 22, 35, 12, 28];
  for (let n = 0; n < ACTIVITY_PRICE.length; n++) {
    const ap = activityPlaces[n * 3]; // the first activity of each of the first dozen days
    if (!ap) break;
    await addCost(ap.name, 'activities', ACTIVITY_PRICE[n], 'GBP', { col: 'place_id', val: ap.pid });
  }
  for (const [name, category, total_price, currency] of COSTS)
    await addCost(name, category, total_price, currency, null);

  if (linkUpd.length) {
    execFileSync('docker', [
      'exec',
      CONTAINER,
      'node',
      '-e',
      `const db=require('/app/node_modules/better-sqlite3')('/app/data/travel.db');` + linkUpd.join(';') + ';',
    ]);
  }

  const costCount = journeys.length + stays.length + ACTIVITY_PRICE.length + COSTS.length;
  console.log(
    `Seeded "${TRIP_TITLE}": ${DAYS} days, ${TRANSPORT.length} journeys, ${STAYS.length} stays, ` +
      `${DAYS * 3} activities, ${NOTES.length} notes, ${costCount} costs (journeys/stays/activities linked).`,
  );
}

main().catch((e) => {
  console.error('seed failed:', e.message);
  process.exit(1);
});
