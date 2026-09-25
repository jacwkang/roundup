import { z } from "zod";

export const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const date = new Date(`${v}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v;
});
export const partySchema = z.number().int().min(1).max(12);
export type Venue = { id: number; name: string; locality: string; timeZone: string; source?: "api" | "browser"; url?: string };
export type Slot = { id: string; venue: Venue; day: string; time: string; party: number; seating: string; configToken: string };
export type Quote = { source?: "api" | "browser"; id: string; slot: Slot; terms: string; fingerprint: string; expires: number };
export type Details = { requiresPaymentSetup?: boolean; source?: "api" | "browser"; bookToken: string; expires: number; terms: string; fingerprint: string; paymentId: number | null };
export type Reservation = { id: string; venueId: number; day: string; time: string; party: number };
export interface ReservationProvider {
  search(query: string): Promise<Venue[]>;
  slots(venue: Venue, day: string, party: number): Promise<Slot[]>;
  details(slot: Slot): Promise<Details>;
  book(details: Details, authorizationExpires?: number): Promise<{ reference: string | null; managementToken?: string }>;
  reservations(): Promise<Reservation[]>;
}
export class BookingError extends Error {
  constructor(public code: string, public uncertain = false) { super(code); }
}
