#!/usr/bin/env node
// Writes dev-fixtures.json for `trek-plugin-sdk dev` from the same trip the tests use.
// That server's mock host is a plain fixture store: reads work, but writes don't change
// later reads. Use `npm run sandbox` to try edits end to end.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockTrips } from '../test/fixtures/trip.ts';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dev-fixtures.json');
fs.writeFileSync(out, JSON.stringify({ actingUserId: 1, trips: mockTrips([1]) }, null, 2) + '\n');
console.log(`wrote ${path.relative(process.cwd(), out)}`);
