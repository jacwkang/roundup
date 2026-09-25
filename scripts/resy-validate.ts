import './env';
import { readBookingConfig } from '../src/lib/booking/config';
import { Store } from '../src/lib/messaging/store';
import { Vault } from '../src/lib/booking/vault';
import { Resy } from '../src/lib/booking/resy';
import { ZodError } from 'zod';

function shape(value: unknown, depth = 0): unknown {
  if (value === null) return 'null';
  if (depth > 6) return typeof value;
  if (Array.isArray(value)) return { length: value.length, item: value.length ? shape(value[0], depth + 1) : null };
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k,v]) => [k, /token|secret|password|email|phone|card|address|guest|user/i.test(k) ? '[private]' : shape(v, depth + 1)]));
  return typeof value;
}
async function main() {
  const config = readBookingConfig({ ...process.env, ARA_AI_ENABLED: 'true', ARA_BOOKINGS_ENABLED: 'false' })!;
  const store = new Store(process.env.ARA_DATABASE_PATH || './data/ara-sendblue.db');
  const vault = new Vault(store.db, config.ARA_CREDENTIAL_KEY);
  const fetcher: typeof fetch = async (url, init) => {
    const path = new URL(String(url)).pathname;
    const expectedMethod = path === '/3/venuesearch/search' ? 'POST' : 'GET';
    if (!['/2/user','/3/venuesearch/search','/4/find','/3/details'].includes(path) || (init?.method || 'GET') !== expectedMethod) throw new Error('read_only_guard');
    const result = await fetch(url, init);
    const data = await result.clone().json().catch(() => null);
    console.log(JSON.stringify({ endpoint: path, status: result.status, shape: path === '/2/user' ? '[private profile omitted]' : shape(data) }));
    return result;
  };
  const resy = new Resy(config, () => vault.token(config.ARA_BOOKING_OWNER), fetcher);
  try {
    await resy.profile();
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: config.ARA_TIME_ZONE }).format(new Date(Date.now() + 86400000));
    for (const query of ['Balthazar', 'The Smith']) {
      const venues = await resy.search(query);
      console.log(JSON.stringify({ restaurants: venues }));
      for (const venue of venues.slice(0, 2)) {
        const slots = await resy.slots(venue, day, 2);
        console.log(JSON.stringify({ venue: venue.name, day, party: 2, slotCount: slots.length, times: slots.slice(0, 3).map(s => s.time) }));
        if (slots.length) {
          try { const details = await resy.details(slots[0]); console.log(JSON.stringify({ detailsVerified: true, terms: details.terms })); }
          catch (e) { report(e); process.exitCode = 1; }
          return;
        }
      }
    }
    console.log('No available slot found in the sample; booking-details validation remains pending.');
    process.exitCode = 1;
  } finally { store.close(); }
}
function report(error: unknown) { console.log(JSON.stringify({ error: error instanceof ZodError ? 'schema_mismatch' : error instanceof Error ? error.message : 'unknown', paths: error instanceof ZodError ? error.issues.map(i => ({ path: i.path, code: i.code })) : undefined })); }
main().catch(e => { report(e); process.exitCode = 1; });
