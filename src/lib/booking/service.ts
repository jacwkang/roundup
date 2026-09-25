import { BrowserPreflightError } from "./browser/checkout";
import type { Job } from "../messaging/store";
import type { BookingConfig } from "./config";
import { BookingStore, type Attempt } from "./store";
import { BookingError, type Quote, type ReservationProvider, type Slot } from "./types";
import { BrowserHandoff, safeURL } from "./browser/policy";

export function describe(slot: Slot) {
  return `${slot.venue.name} (${slot.venue.locality}), ${slot.day} at ${slot.time} ${slot.venue.timeZone}, party of ${slot.party}, ${slot.seating}`;
}
export function confirmation(attempt: Attempt) {
  return `Booked: ${describe(attempt.quote.slot)}. ${attempt.reference ? `Resy reference: ${attempt.reference}` : `Ara record: ${attempt.id}`}. The connected owner can manage or cancel in the Resy app or at https://resy.com/.`;
}
export function authorization(text: string): { quoteId?: string } | undefined {
  // Authorization comes from the authenticated current message, never model output, history, or tool arguments.
  const clean = text.trim().replace(/^ara[,:!]?\s*/i, "").replace(/[.!]$/, "");
  const feeApproval = /^book ([A-F0-9]{8}) and I accept the displayed fees and cancellation terms$/i.exec(clean);
  if (feeApproval) return { quoteId: feeApproval[1].toUpperCase() };
  const match = /^(?:yes[, ]+)?(?:please )?book (it|that|[A-F0-9]{8})(?: please)?$/i.exec(clean);
  return match ? { quoteId: /^(it|that)$/i.test(match[1]) ? undefined : match[1].toUpperCase() } : undefined;
}
export class BookingService {
  constructor(readonly store: BookingStore, readonly provider: ReservationProvider, readonly config: BookingConfig) {}
  async quote(job: Job, slot: Slot) {
    const details = await this.provider.details(slot);
    if (details.requiresPaymentSetup) return `Not booked: ${describe(slot)}.\n${details.terms}\nResy did not expose a saved payment method for this checkout. The owner needs to check payment setup privately in Resy, then ask me for a fresh quote. I cannot submit this checkout yet.`;
    const quote = this.store.quote(job, this.config.ARA_BOOKING_OWNER, slot, details.terms, details.fingerprint, details.expires, details.source);
    const approval = quote.source === "browser" ? `say “Ara, book ${quote.id} and I accept the displayed fees and cancellation terms”` : `say “Ara, book ${quote.id}” or “Ara, book it”`;
    return `Not booked yet: ${describe(slot)}.\n${quote.terms}\nThis uses the connected owner's Resy account. Only that owner can authorize it. To approve these exact details, ${approval}. Quote expires in five minutes or when the slot expires, whichever is sooner.`;
  }
  private existing(job: Job, quote: Quote) {
    return this.store.attempts(this.config.ARA_BOOKING_OWNER).find(a => a.quote_id === quote.id || a.quote.slot.day === quote.slot.day || a.state === "unknown");
  }
  async book(job: Job, quoteId?: string): Promise<string> {
    if (job.sender !== this.config.ARA_BOOKING_OWNER) return "Only the connected booking owner can authorize use of their Resy account.";
    const quote = this.store.getQuote(job.chat_id, job.sender, quoteId, job);
    if (!quote) return "I need to show you a current Resy slot and its terms before you can authorize a booking. Which table should I check?";
    const existing = this.existing(job, quote);
    if (existing) return existing.chat_id === job.chat_id ? existing.state === "confirmed" ? confirmation(existing) :
      "A booking may already have reached Resy. I will not send another booking request until it is reconciled. Ask me to check booking status, and check your Resy account." :
      "The connected account has an existing or unresolved booking. The owner needs to review it privately before another booking.";
    if (quote.source === "browser" && !new RegExp(`^ara[,:!]?\\s+book ${quote.id} and I accept the displayed fees and cancellation terms[.!]?$`, "i").test(job.body.trim()))
      return `Nothing was booked. To accept this table's displayed fees and cancellation terms, say “Ara, book ${quote.id} and I accept the displayed fees and cancellation terms”.`;
    if (!this.config.bookingsEnabled) return "Live bookings are disabled. Nothing was booked. The operator must finish Resy setup and enable booking first.";
    if (quote.expires <= Date.now()) return "That quote expired. Nothing was booked. Ask me to check the slot again for fresh terms.";
    // Refresh exact inventory: no nearest-time substitution, and no new approval can inherit old fees.
    const available = await this.provider.slots(quote.slot.venue, quote.slot.day, quote.slot.party);
    const slot = available.find(s => s.time === quote.slot.time && s.seating === quote.slot.seating);
    if (!slot) return "That exact table is no longer available. Nothing was booked. Ask me to check other times.";
    const details = await this.provider.details(slot);
    if (details.requiresPaymentSetup) return "Nothing was booked. The owner needs to check payment setup privately in Resy, then request a fresh quote.";
    if (details.fingerprint !== quote.fingerprint || details.source !== quote.source) return "Resy's terms changed. Nothing was booked. Ask me to check the table again so you can review the new terms.";
    if (details.expires <= Date.now() + 5000 || quote.expires <= Date.now()) return "That quote expired before booking. Nothing was booked. Please ask me to check again.";
    const attempt = this.store.begin(job, job.sender, quote);
    try {
      const result = await this.provider.book(details, quote.expires);
      this.store.confirm(attempt, result.reference, result.managementToken);
      return confirmation(this.store.attempts(job.sender).find(a => a.id === attempt)!);
    } catch (error) {
      if(error instanceof BrowserPreflightError){this.store.resolveNotBooked(job.sender,attempt,`Browser checkout preparation failed before submission: ${error.code}. No booking request could be sent.`);return "Nothing was booked: the browser checkout could not be prepared. The operator needs to inspect it before trying again.";}
      return "I could not verify the booking result. It may have reached Resy. I have paused further bookings to avoid a duplicate. Check your Resy account or ask me to check booking status.";
    }
  }
  async status(chat: string) {
    const attempts = this.store.attempts(this.config.ARA_BOOKING_OWNER).filter(a => a.chat_id === chat);
    if (!attempts.length) return "Ara has not attempted a reservation in this group.";
    const latest = attempts[0];
    if (latest.state === "confirmed") return `Ara previously recorded this reservation: ${describe(latest.quote.slot)}. ${latest.reference ? `Resy reference: ${latest.reference}` : `Ara record: ${latest.id}`}. Check https://resy.com/ or the Resy app for its current status and any changes/cancellation made outside Ara.`;
    // Give an in-flight call time to finish before a separate operator or worker can reconcile it.
    if (Date.now() - latest.created_at < 120000) return "That booking result is still uncertain. Please check Resy and ask me again in two minutes. I will not retry it.";
    if (latest.quote.source === "browser") return "This browser booking is unresolved. The owner must check Resy directly; I will not retry or automatically clear the hold.";
    const reservations = await this.provider.reservations();
    const slot = latest.quote.slot;
    const matches = reservations.filter(r => r.venueId === slot.venue.id && r.day === slot.day && r.time === slot.time && r.party === slot.party);
    if (matches.length === 1) {
      this.store.confirm(latest.id, matches[0].id);
      return confirmation({ ...latest, state: "confirmed", reference: matches[0].id });
    }
    return "I could not uniquely reconcile that booking. I will not retry it. The owner must check Resy directly; the operator can investigate the held attempt.";
  }
}

export function friendlyError(error: unknown) {
  if (error instanceof BrowserHandoff) {
    let url = "https://resy.com/";
    try { url = safeURL(error.url); } catch { /* Never echo untrusted links. */ }
    if(error.reason === "reconcile_in_resy") return `I cannot verify the unresolved booking automatically. Please check your Resy reservations: ${url}. I will not retry it while the result is uncertain.`;
    if(/terms|checkout|payment/.test(error.reason)) return `I could not verify this table's booking terms automatically. Please review them in Resy: ${url}. No booking was attempted.`;
    return `I could not verify this restaurant's live availability right now. You can check it directly in Resy: ${url}. No booking was attempted.`;
  }
  const code = error instanceof BookingError ? error.code : error instanceof Error && error.message === "account_not_connected" ? "account_not_connected" : "provider_error";
  if (code === "account_not_connected" || code === "resy_auth_expired") return "The booking owner needs to connect or renew their Resy account privately. Do not send credentials in this chat.";
  if (code === "resy_access_denied") return "Resy denied access to this request. The operator needs to check the Resy API access and configuration. I have not confirmed a reservation.";
  if (code === "unsupported_terms" || code === "unsupported_token_expiry") return "I cannot safely verify this table's payment/cancellation terms or booking expiry yet. Nothing was booked. Please use Resy directly: https://resy.com/.";
  return "I could not complete that Resy check. I have not confirmed a reservation. Please check booking status before trying again.";
}
