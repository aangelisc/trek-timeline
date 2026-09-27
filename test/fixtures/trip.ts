import type { MockHostOptions } from 'trek-plugin-sdk';
import type {
  RawAccommodation,
  RawAssignment,
  RawCost,
  RawDay,
  RawDayNote,
  RawEndpoint,
  RawPlace,
  RawReservation,
  RawTrek,
} from '../../src/server/trek.ts';

// A 13-day London → Tokyo → Kyoto → Seoul trip in the shapes TREK's plugin reads
// return (trips.getDays embeds assignments + notes_items). It is deliberately
// imperfect so every warning rule has something to find:
//   - the night of Oct 12 has no stay (gap)
//   - an Airbnb overlaps the Tokyo hotel for one night
//   - the Seoul flight lands after that hotel's check-in window closes
//   - the teamLab booking sits on Oct 7 but is dated Oct 8
//   - Oct 8 has nothing planned
//   - an onsen trip is dated after the trip ends

export const TRIP_ID = 1;
export const DATES = [
  '2026-10-04',
  '2026-10-05',
  '2026-10-06',
  '2026-10-07',
  '2026-10-08',
  '2026-10-09',
  '2026-10-10',
  '2026-10-11',
  '2026-10-12',
  '2026-10-13',
  '2026-10-14',
  '2026-10-15',
  '2026-10-16',
];
export const dayId = (date: string): number => 101 + DATES.indexOf(date);

const CATEGORIES = {
  sight: { name: 'Sightseeing', color: '#6366f1', icon: 'Landmark' },
  food: { name: 'Food', color: '#f59e0b', icon: 'Utensils' },
  hotel: { name: 'Accommodation', color: '#10b981', icon: 'Bed' },
};

type Cat = keyof typeof CATEGORIES;

const PLACES: (RawPlace & { name: string; _cat: Cat })[] = (
  [
    [1, 'Senso-ji', 'sight'],
    [2, 'Shibuya Sky', 'sight'],
    [3, 'Meiji Shrine', 'sight'],
    [4, 'Tsukiji Outer Market', 'food'],
    [5, 'Fushimi Inari', 'sight'],
    [6, 'Nishiki Market', 'food'],
    [7, 'Kinkaku-ji', 'sight'],
    [8, 'Arashiyama', 'sight'],
    [9, 'Gyeongbokgung', 'sight'],
    [10, 'Bukchon Hanok Village', 'sight'],
    [11, 'Myeongdong', 'food'],
    [20, 'Hotel Gracery Shinjuku', 'hotel'],
    [21, 'Ryokan Yoshida', 'hotel'],
    [22, 'L7 Myeongdong', 'hotel'],
    [23, 'Shinjuku Airbnb', 'hotel'],
    [30, 'Nara Park', 'sight'],
    [31, 'Ghibli Museum', 'sight'],
  ] as [number, string, Cat][]
).map(([id, name, cat]) => ({
  id,
  trip_id: TRIP_ID,
  name,
  lat: 0,
  lng: 0,
  category_id: null as number | null,
  _cat: cat,
}));

// [assignment id, date, place id, place_time]
const ASSIGNMENTS: [number, string, number, string][] = [
  [1, '2026-10-05', 1, '10:00'],
  [2, '2026-10-05', 2, '17:30'],
  [3, '2026-10-06', 3, '09:00'],
  [4, '2026-10-07', 4, '08:00'],
  [5, '2026-10-10', 5, '07:30'],
  [6, '2026-10-10', 6, '12:00'],
  [7, '2026-10-11', 7, '10:00'],
  [8, '2026-10-12', 8, '09:30'],
  [9, '2026-10-14', 9, '10:00'],
  [10, '2026-10-14', 10, '14:00'],
  [11, '2026-10-15', 11, '18:00'],
];

// [note id, date, text, sort_order]
const NOTES: [number, string, string, number][] = [
  [1, '2026-10-05', 'Pick up JR Pass at the airport', 0.5],
  [2, '2026-10-10', 'Kimono rental, 9am', 0.5],
];

function days(): RawDay[] {
  return DATES.map((date, i): RawDay => {
    const id = dayId(date);
    const assignments = ASSIGNMENTS.filter((a) => a[1] === date).map(([aid, , pid, time], k): RawAssignment => {
      const p = PLACES.find((x) => x.id === pid)!;
      return {
        id: aid,
        day_id: id,
        place_id: pid,
        order_index: k,
        notes: null,
        place_time: time,
        place: {
          id: pid,
          name: p.name,
          category: CATEGORIES[p._cat],
          place_time: time,
        },
      };
    });
    const notes_items = NOTES.filter((n) => n[1] === date).map(([nid, , text, sort]): RawDayNote => ({
      id: nid,
      day_id: id,
      text,
      time: null,
      icon: null,
      color: null,
      sort_order: sort,
    }));
    return {
      id,
      trip_id: TRIP_ID,
      day_number: i + 1,
      date,
      title:
        (
          {
            '2026-10-04': 'Fly out',
            '2026-10-09': 'To Kyoto',
            '2026-10-13': 'To Seoul',
            '2026-10-16': 'Fly home',
          } as Record<string, string>
        )[date] || null,
      notes: null,
      assignments,
      notes_items,
    };
  });
}

const ep = (
  role: RawEndpoint['role'],
  sequence: number,
  code: string | null,
  name: string,
  timezone: string,
  local_date: string,
  local_time: string,
): RawEndpoint => ({
  role,
  sequence,
  code,
  name,
  lat: 0,
  lng: 0,
  timezone,
  local_date,
  local_time,
});

function reservations(): RawReservation[] {
  return [
    {
      id: 1,
      trip_id: TRIP_ID,
      type: 'flight',
      title: 'BA5 London → Tokyo',
      status: 'confirmed',
      confirmation_number: 'BA-X7Q2LM',
      day_id: dayId('2026-10-04'),
      end_day_id: dayId('2026-10-05'),
      reservation_time: '2026-10-04T11:30',
      reservation_end_time: '2026-10-05T08:00',
      endpoints: [
        ep('from', 0, 'LHR', 'London Heathrow', 'Europe/London', '2026-10-04', '11:30'),
        ep('to', 1, 'HND', 'Tokyo Haneda', 'Asia/Tokyo', '2026-10-05', '08:00'),
      ],
    },
    {
      id: 2,
      trip_id: TRIP_ID,
      type: 'train',
      title: 'Nozomi 21 Tokyo → Kyoto',
      status: 'confirmed',
      confirmation_number: 'JR-5521',
      day_id: dayId('2026-10-09'),
      end_day_id: null,
      reservation_time: '2026-10-09T10:00',
      reservation_end_time: '2026-10-09T12:15',
      endpoints: [
        ep('from', 0, null, 'Tokyo Station', 'Asia/Tokyo', '2026-10-09', '10:00'),
        ep('to', 1, null, 'Kyoto Station', 'Asia/Tokyo', '2026-10-09', '12:15'),
      ],
    },
    {
      id: 3,
      trip_id: TRIP_ID,
      type: 'flight',
      title: 'KE724 Osaka → Seoul',
      status: 'pending',
      confirmation_number: null,
      day_id: dayId('2026-10-13'),
      end_day_id: null,
      reservation_time: '2026-10-13T19:30',
      reservation_end_time: '2026-10-13T21:25',
      endpoints: [
        ep('from', 0, 'KIX', 'Kansai International', 'Asia/Tokyo', '2026-10-13', '19:30'),
        ep('to', 1, 'ICN', 'Incheon', 'Asia/Seoul', '2026-10-13', '21:25'),
      ],
    },
    {
      id: 4,
      trip_id: TRIP_ID,
      type: 'flight',
      title: 'KE907 Seoul → London',
      status: 'confirmed',
      confirmation_number: 'KE-99PQ',
      day_id: dayId('2026-10-16'),
      end_day_id: null,
      reservation_time: '2026-10-16T12:40',
      reservation_end_time: '2026-10-16T17:30',
      endpoints: [
        ep('from', 0, 'ICN', 'Incheon', 'Asia/Seoul', '2026-10-16', '12:40'),
        ep('to', 1, 'LHR', 'London Heathrow', 'Europe/London', '2026-10-16', '17:30'),
      ],
    },
    {
      id: 5,
      trip_id: TRIP_ID,
      type: 'restaurant',
      title: 'Sushi Saito',
      status: 'confirmed',
      confirmation_number: 'SS-22',
      day_id: dayId('2026-10-06'),
      reservation_time: '2026-10-06T19:00',
      day_positions: { [dayId('2026-10-06')]: 1 },
      endpoints: [],
    },
    {
      id: 6,
      trip_id: TRIP_ID,
      type: 'event',
      title: 'teamLab Planets',
      status: 'confirmed',
      confirmation_number: 'TL-808',
      day_id: dayId('2026-10-07'),
      reservation_time: '2026-10-08T15:00',
      day_positions: { [dayId('2026-10-07')]: 2 },
      endpoints: [],
    },
    {
      id: 7,
      trip_id: TRIP_ID,
      type: 'event',
      title: 'Robot show',
      status: 'pending',
      day_id: null,
      reservation_time: null,
      endpoints: [],
    },
    {
      id: 8,
      trip_id: TRIP_ID,
      type: 'tour',
      title: 'Hakone onsen day trip',
      status: 'pending',
      day_id: null,
      reservation_time: '2026-10-20T08:00',
      endpoints: [],
    },
    // The hotel bookings TREK creates alongside each stay.
    ...(
      [
        [10, 1, 'Hotel Gracery'],
        [11, 2, 'Ryokan Yoshida'],
        [12, 3, 'L7 Myeongdong'],
        [13, 4, 'Shinjuku Airbnb'],
      ] as [number, number, string][]
    ).map(([id, acc, title]): RawReservation => ({
      id,
      trip_id: TRIP_ID,
      type: 'hotel',
      title,
      status: 'confirmed',
      accommodation_id: acc,
      endpoints: [],
    })),
  ];
}

function accommodations(): RawAccommodation[] {
  const stay = (
    id: number,
    place_id: number,
    start: string,
    end: string,
    extra: Partial<RawAccommodation>,
  ): RawAccommodation => ({
    id,
    trip_id: TRIP_ID,
    place_id,
    start_day_id: dayId(start),
    end_day_id: dayId(end),
    place_name: PLACES.find((p) => p.id === place_id)!.name,
    ...extra,
  });
  return [
    stay(1, 20, '2026-10-05', '2026-10-09', {
      check_in: '15:00',
      check_in_end: '23:00',
      check_out: '11:00',
      confirmation: 'GRC-4411',
    }),
    stay(2, 21, '2026-10-09', '2026-10-12', {
      check_in: '15:00',
      check_in_end: '19:00',
      check_out: '10:00',
      confirmation: 'RY-1203',
    }),
    stay(3, 22, '2026-10-13', '2026-10-16', {
      check_in: '15:00',
      check_in_end: '21:00',
      check_out: '11:00',
      confirmation: null,
    }),
    stay(4, 23, '2026-10-08', '2026-10-09', {
      check_in: '16:00',
      check_in_end: null,
      check_out: '10:00',
      confirmation: null,
    }),
  ];
}

function costs(): RawCost[] {
  const c = (
    id: number,
    category: string,
    name: string,
    total_price: number,
    extra: Partial<RawCost> = {},
  ): RawCost => ({
    id,
    trip_id: TRIP_ID,
    category,
    name,
    total_price,
    currency: 'EUR',
    ...extra,
  });
  return [
    c(1, 'Flights', 'BA5', 850, { reservation_id: 1 }),
    c(2, 'Transport', 'Shinkansen', 95, { reservation_id: 2 }),
    c(3, 'Flights', 'KE724', 180, { reservation_id: 3 }),
    c(4, 'Flights', 'KE907', 720, { reservation_id: 4 }),
    c(5, 'Food', 'Sushi Saito', 300, { reservation_id: 5 }),
    c(6, 'Accommodation', 'Hotel Gracery', 620, { reservation_id: 10 }),
    c(7, 'Accommodation', 'Ryokan Yoshida', 900, { reservation_id: 11 }),
    c(8, 'Accommodation', 'L7 Myeongdong', 360, { reservation_id: 12 }),
    c(9, 'Accommodation', 'Shinjuku Airbnb', 95, { reservation_id: 13 }),
    c(10, 'Activities', 'Shibuya Sky tickets', 20, { place_id: 2 }),
    c(11, 'Food', 'Izakaya dinner', 45, { expense_date: '2026-10-07' }),
    c(12, 'Transport', 'Suica top-up', 5000, {
      currency: 'JPY',
      exchange_rate: 0.0062,
      expense_date: '2026-10-05',
    }),
    c(13, 'Other', 'Travel insurance', 60),
  ];
}

function places(): RawPlace[] {
  return PLACES.map(({ _cat, ...p }) => p);
}

/** A fresh deep copy each call, so a test can mutate it freely. */
export function tripFixture(): RawTrek {
  return {
    trip: {
      id: TRIP_ID,
      title: 'Japan & Korea',
      start_date: DATES[0],
      end_date: DATES[DATES.length - 1],
      currency: 'EUR',
    },
    days: days(),
    reservations: reservations(),
    accommodations: accommodations(),
    places: places(),
    costs: costs(),
  };
}

/** The fixture in createMockHost's `trips` shape. */
export function mockTrips(members = [1]): NonNullable<MockHostOptions['trips']> {
  const f = tripFixture();
  return {
    [TRIP_ID]: {
      members,
      data: f.trip,
      days: f.days,
      reservations: f.reservations,
      accommodations: f.accommodations,
      places: f.places,
      costs: f.costs,
    },
  };
}
