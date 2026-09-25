import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { BookingConfig } from "./config";
import { BookingError, daySchema, partySchema, type Details, type ReservationProvider, type Slot, type Venue } from "./types";

const id = z.coerce.number().int().positive();
const text = z.string().min(1).max(200);
const object = z.record(z.unknown());
export const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const code = () => randomBytes(4).toString("hex").toUpperCase();
function localTime(value: string, day: string) {
  // Resy returns venue-local timestamps. Never reinterpret them using the worker's OS time zone.
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}):\d{2}$/.exec(value);
  if (!match || match[1] !== day || !/^([01]\d|2[0-3]):[0-5]\d$/.test(match[2])) throw new BookingError("unsupported_resy_time");
  return match[2];
}

/** Deliberately limited until live payloads are validated. Unknown terms NEVER mean free. */
export function readTerms(raw: unknown): { terms: string; fingerprint: string } {
  const parsed = z.object({
    payment: z.object({ is_paid: z.literal(false), amount: z.literal(0).optional() }).passthrough(),
    cancellation: z.object({ fee: z.object({ amount: z.literal(0) }).passthrough() }).passthrough(),
  }).safeParse(raw);
  if (!parsed.success) throw new BookingError("unsupported_terms");
  // This first adapter only executes ordinary, zero-upfront-payment, zero-cancellation-fee tables.
  // Reject additional financial instructions rather than interpreting unknown fields as harmless.
  const payment = parsed.data.payment, cancellation = parsed.data.cancellation;
  if (Object.keys(payment).some(k => !["is_paid", "amount", "currency"].includes(k)) ||
      Object.keys(cancellation).some(k => k !== "fee") ||
      Object.keys(cancellation.fee).some(k => k !== "amount")) throw new BookingError("unsupported_terms");
  const top = object.parse(raw);
  if (["deposit", "refund", "terms", "policies", "no_show", "no_show_fee"].some(k => top[k] != null)) throw new BookingError("unsupported_terms");
  return { terms: "Resy reports no upfront payment and a cancellation fee of 0. Manage or cancel directly in Resy.",
    fingerprint: fingerprint({ payment, cancellation }) };
}

export class Resy implements ReservationProvider {
  constructor(private config: BookingConfig, private token: () => string, private fetcher: typeof fetch = fetch) {}
  private async request(path: string, body?: URLSearchParams | Record<string, unknown>, mutation = false): Promise<unknown> {
    const token = this.token(); // Resolve before entering the uncertain network boundary.
    let response: Response;
    try {
      response = await this.fetcher(`https://api.resy.com${path}`, {
        method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(15000),
        headers: { Authorization: `ResyAPI api_key="${this.config.RESY_API_KEY}"`,
          "x-resy-auth-token": token, "x-resy-universal-auth": token,
          Origin: "https://resy.com", Referer: "https://resy.com/", Accept: "application/json",
          ...(body ? { "Content-Type": body instanceof URLSearchParams ? "application/x-www-form-urlencoded" : "application/json" } : {}) },
        body: body instanceof URLSearchParams ? body.toString() : body ? JSON.stringify(body) : undefined,
      });
    } catch { throw new BookingError("resy_unreachable", mutation); }
    if (!response.ok) {
      const code = response.status === 401 ? "resy_auth_expired" : response.status === 403 ? "resy_access_denied" : `resy_http_${response.status}`;
      throw new BookingError(code, mutation); // Even a malformed/errored booking response cannot prove no reservation.
    }
    try { return await response.json(); } catch { throw new BookingError("resy_invalid_response", mutation); }
  }
  async profile() {
    const raw = z.object({ id: id, payment_methods: z.array(z.object({ id, is_default: z.boolean().optional() })).optional() }).parse(await this.request("/2/user"));
    return { id: raw.id, paymentId: raw.payment_methods?.find(p => p.is_default)?.id ?? raw.payment_methods?.[0]?.id ?? null };
  }
  async search(query: string): Promise<Venue[]> {
    z.string().min(1).max(150).parse(query);
    const raw = z.object({ search: z.object({ hits: z.array(z.object({
      id: z.object({ resy: id }), name: text,
      location: z.object({ locality: text, time_zone: z.string().optional() }),
    })) }) }).parse(await this.request("/3/venuesearch/search", {
      query, types: ["venue"], geo: { latitude: this.config.ARA_LATITUDE, longitude: this.config.ARA_LONGITUDE },
    }));
    const localities = (this.config.ARA_ALLOWED_LOCALITIES || this.config.ARA_PILOT_CITY).split(",").map(v => v.trim().toLowerCase());
    return raw.search.hits.filter(v => localities.includes(v.location.locality.toLowerCase()) && (!v.location.time_zone || v.location.time_zone === this.config.ARA_TIME_ZONE)).slice(0, 5).map(v => ({ id: v.id.resy, name: v.name, locality: v.location.locality,
      timeZone: v.location.time_zone || this.config.ARA_TIME_ZONE }));
  }
  async slots(venue: Venue, day: string, party: number): Promise<Slot[]> {
    daySchema.parse(day); partySchema.parse(party); id.parse(venue.id);
    const query = new URLSearchParams({ lat: String(this.config.ARA_LATITUDE), long: String(this.config.ARA_LONGITUDE), day, party_size: String(party), venue_id: String(venue.id) });
    const raw = z.object({ results: z.object({ venues: z.array(z.object({
      venue: z.object({ id: z.object({ resy: id }) }),
      slots: z.array(z.object({ config: z.object({ token: z.string().min(1).max(10000), type: text }), date: z.object({ start: text }) })),
    })) }) }).parse(await this.request(`/4/find?${query}`));
    const result = raw.results.venues[0];
    if (!result) return [];
    if (result.venue && result.venue.id.resy !== venue.id) throw new BookingError("venue_mismatch");
    return result.slots.map(s => ({ id: code(), venue, day, party, time: localTime(s.date.start, day), seating: s.config.type, configToken: s.config.token }));
  }
  async details(slot: Slot): Promise<Details> {
    const query = new URLSearchParams({ config_id: slot.configToken, day: slot.day, party_size: String(slot.party) });
    const raw = await this.request(`/3/details?${query}`);
    const parsed = z.object({ book_token: z.object({ value: z.string().min(1), date_expires: z.string().optional(), expires: z.string().optional() }) }).parse(raw);
    const expiry = parsed.book_token.date_expires ?? parsed.book_token.expires;
    // Never guess the zone of an ambiguous expiry timestamp. In that case use a short local
    // quote lifetime; booking always fetches a fresh token and never promises inventory is held.
    const expires = expiry && /(Z|[+-]\d{2}:?\d{2})$/.test(expiry) ? Date.parse(expiry) : Date.now() + 60000;
    if (!Number.isFinite(expires) || expires <= Date.now()) throw new BookingError("slot_expired");
    const terms = readTerms(raw);
    const profile = await this.profile();
    return { bookToken: parsed.book_token.value, expires, terms: terms.terms,
      fingerprint: fingerprint({ terms: terms.fingerprint, account: profile.id, paymentId: profile.paymentId }), paymentId: profile.paymentId };
  }
  async book(details: Details) {
    const body = new URLSearchParams({ book_token: details.bookToken, source_id: "resy.com-venue-details" });
    if (details.paymentId !== null) body.set("struct_payment_method", JSON.stringify({ id: details.paymentId }));
    const raw = await this.request("/3/book", body, true);
    const result = z.object({ reservation_id: z.union([text, id]).optional(), resy_token: z.string().min(1).max(10000).optional() })
      .refine(r => r.reservation_id != null || !!r.resy_token).safeParse(raw);
    if (!result.success) throw new BookingError("booking_needs_reconciliation", true);
    // Resy's token-only success shape is valid, but the token must stay private and encrypted.
    return { reference: result.data.reservation_id == null ? null : String(result.data.reservation_id), managementToken: result.data.resy_token };
  }
  async reservations() {
    const data = z.object({ reservations: z.array(z.object({ reservation_id: z.union([text, id]),
      venue: z.object({ id: z.object({ resy: id }) }), day: daySchema, time_slot: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/), num_seats: partySchema,
    })) }).parse(await this.request("/3/user/reservations"));
    return data.reservations.map(r => ({ id: String(r.reservation_id), venueId: r.venue.id.resy, day: r.day, time: r.time_slot.slice(0, 5), party: r.num_seats }));
  }
}
