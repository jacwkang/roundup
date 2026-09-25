import { ZodError } from 'zod';
import { BookingError, daySchema, partySchema, type ReservationProvider, type Venue, type Slot, type Details } from './types';
function eligible(error: unknown) {
  return error instanceof ZodError || error instanceof BookingError && !error.uncertain &&
    /^(resy_(access_denied|unreachable|invalid_response|http_(404|408|429|5\d\d))|unsupported_terms|unsupported_resy_time)$/.test(error.code);
}
export class FallbackProvider implements ReservationProvider {
  constructor(private api: ReservationProvider, private browser: ReservationProvider) {}
  private async read<T>(api: () => Promise<T>, browser: () => Promise<T>): Promise<T> {
    try { return await api(); } catch (error) { if (!eligible(error)) throw error; return browser(); }
  }
  search(query: string) {
    if (!query.trim() || query.length > 150) throw new BookingError('invalid_query');
    return this.read(() => this.api.search(query), () => this.browser.search(query));
  }
  slots(venue: Venue, day: string, party: number) {
    daySchema.parse(day); partySchema.parse(party);
    return venue.source === 'browser' ? this.browser.slots(venue,day,party) : this.read(() => this.api.slots(venue,day,party), () => this.browser.slots(venue,day,party));
  }
  details(slot: Slot) { return slot.venue.source === 'browser' ? this.browser.details(slot) : this.read(() => this.api.details(slot), () => this.browser.details(slot)); }
  book(details: Details, authorizationExpires?:number) { return details.source === 'browser' ? this.browser.book(details,authorizationExpires) : this.api.book(details,authorizationExpires); } // NEVER switch transport after an attempted mutation.
  reservations() { return this.read(() => this.api.reservations(), () => this.browser.reservations()); }
}
