import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { BookingConfig } from '../config';
import { daySchema, partySchema, type ReservationProvider, type Venue, type Slot, type Details, type Reservation } from '../types';
import type { BrowserConfig } from './config';
import { inspect, screenshot, type Snapshot } from './dom';
import { BrowserHandoff, ladder, safeURL, type Stage } from './policy';
import type { SteelBrowser } from './steel';
import type { SelectCandidates } from './model';
import type { BrowserCheckout } from './checkout';
import { inspectAvailability } from './availability';
export class BrowserProvider implements ReservationProvider {
  constructor(private remote: SteelBrowser, private config: BookingConfig, private browserConfig: BrowserConfig,
    private select: SelectCandidates, private trace: (stage: Stage) => void = stage => console.info(JSON.stringify({event:'browser_fallback',stage})), private checkout?:BrowserCheckout) {}
  async search(query: string): Promise<Venue[]> {
    z.string().min(1).max(150).parse(query);
    const url = new URL(`https://resy.com/cities/${this.browserConfig.ARA_RESY_CITY_SLUG}/search`); url.searchParams.set('query',query);
    const session = await this.remote.open();
    try {
      const page = session.page;
      let snapshot: Snapshot | undefined;
      const read = async () => snapshot = await inspect(page);
      const convert = (data: Snapshot, ids?: number[]): Venue[] => data.candidates.filter(c => (!ids || ids.includes(c.id)) &&
        new URL(c.url).pathname.startsWith(`/cities/${this.browserConfig.ARA_RESY_CITY_SLUG}/venues/`)).slice(0,5).map(c => ({
          id: parseInt(createHash('sha256').update(c.url).digest('hex').slice(0,7),16) + 1,
          name:c.name, locality:this.config.ARA_PILOT_CITY, timeZone:this.config.ARA_TIME_ZONE, source:'browser', url:c.url }));
      return await ladder([
        { stage:'playwright', run:async () => {
          await page.goto(safeURL(url.toString()),{waitUntil:'domcontentloaded'});
          const search = page.getByRole('searchbox').first();
          if (await search.count()) { await search.fill(query); await search.press('Enter'); }
          await page.locator('main a[href*="/venues/"]').first().waitFor({timeout:6000}).catch(() => undefined);
          const data = await read();
          if (data.searchValue.toLowerCase() === query.toLowerCase() && data.candidates.length) return convert(data);
          return undefined;
        } },
        { stage:'dom', run:async () => {
          const data = await read();
          if (/no (?:results|restaurants) found/i.test(data.text) && data.searchValue.toLowerCase() === query.toLowerCase()) return [];
          const exact = data.candidates.filter(c => c.name.trim().toLowerCase() === query.trim().toLowerCase());
          if (new URL(data.url).searchParams.get('query')?.toLowerCase() === query.toLowerCase() && exact.length) {
            const results = convert(data,exact.map(c => c.id));
            if (results.length) return results;
          }
          if (data.text.toLowerCase().includes(`results for ${query.toLowerCase()}`) && data.candidates.length) return convert(data);
          return undefined;
        } },
        { stage:'dom_llm', run:async () => {
          if (this.browserConfig.ARA_BROWSER_DOM_LLM !== 'true' || !snapshot?.candidates.length) return;
          const ids = await this.select(query,snapshot); const result = convert(snapshot,ids); return result.length ? result : undefined;
        } },
        { stage:'screenshot', run:async () => {
          if (this.browserConfig.ARA_BROWSER_SCREENSHOTS !== 'true' || !snapshot?.candidates.length) return;
          const image = await screenshot(page); if (!image) return;
          const ids = await this.select(query,snapshot,image); const result = convert(snapshot,ids); return result.length ? result : undefined;
        } },
      ], this.trace);
    } catch (error) {
      if (error instanceof BrowserHandoff) throw error;
      throw new BrowserHandoff('browser_search_failed',url.toString());
    } finally { await session.close(); }
  }
  async slots(venue: Venue, day: string, party: number): Promise<Slot[]> {
    daySchema.parse(day); partySchema.parse(party);
    if (!venue.url) throw new BrowserHandoff('browser_venue_identity_missing');
    if (!new URL(safeURL(venue.url)).pathname.startsWith(`/cities/${this.browserConfig.ARA_RESY_CITY_SLUG}/venues/`) || venue.timeZone!==this.config.ARA_TIME_ZONE)
      throw new BrowserHandoff('browser_region_mismatch');
    const session=await this.remote.open();
    try {
      this.trace('playwright');this.trace('dom');
      return await inspectAvailability(session.page,venue,day,party);
    } catch(error) {
      if (error instanceof BrowserHandoff) throw error;
      throw new BrowserHandoff('browser_availability_failed',venue.url);
    } finally {await session.close();}
  }
  async details(slot: Slot): Promise<Details> { if(!this.checkout)throw new BrowserHandoff('browser_checkout_unavailable',slot.venue.url);return this.checkout.details(slot); }
  async book(details:Details,authorizationExpires?:number): Promise<{reference:string|null;managementToken?:string}> { if(!this.config.bookingsEnabled || !this.checkout)throw new BrowserHandoff('browser_mutation_disabled');return this.checkout.book(details,authorizationExpires); }
  async reservations(): Promise<Reservation[]> { throw new BrowserHandoff('reconcile_in_resy'); }
}
