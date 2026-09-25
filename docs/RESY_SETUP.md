# Ara M2: private Resy setup and testing

M1 is the accepted Sendblue baseline. M2 is opt-in and has automated coverage plus a successful live OpenAI check. **Resy account access is verified, but restaurant search returned HTTP 403 Forbidden. Read-only browser availability is now verified for Balthazar; API availability, booking-details formats, and a deliberately authorized real booking remain unverified. M2 has not passed its release gate.** Keep the current M1 worker running until the setup below is ready.

## What account books the table?

One designated owner's personal Resy account. `ARA_BOOKING_OWNER` is that person's exact incoming Sendblue phone number in E.164 format. Other participants can search and select options, but cannot authorize that account. Private terminal setup binds the connected account to that configured identity; it is not a public account-connection endpoint.

The owner supplies their own active Resy session, which Ara checks using the profile endpoint and stores encrypted with AES-256-GCM in the local database. Credentials, slot tokens, booking tokens, and private reservation-management tokens are never included in model context or group replies. The encryption key stays outside the database in `.env.local`. Changing the connected account/payment method invalidates previously quoted booking terms.

## 1. Configure the pilot

Keep the existing Sendblue settings. Add these to the gitignored `.env.local`:

```dotenv
ARA_AI_ENABLED=false
ARA_BOOKINGS_ENABLED=false
OPENAI_MODEL=gpt-4.1-mini
# Keep your existing OPENAI_API_KEY, or add it privately here.
ARA_BOOKING_OWNER=+1YOURNUMBER
ARA_PILOT_CITY=New York
ARA_TIME_ZONE=America/New_York
ARA_LATITUDE=40.7128
ARA_LONGITUDE=-74.0060
# Optional comma-separated exact Resy locality names within the same time zone.
ARA_ALLOWED_LOCALITIES=New York,Brooklyn,Queens
RESY_API_KEY=
```

The city/coordinates above are examples. Set them for your group. This pilot supports exactly one allowlisted group, one owner, and one configured region/time zone. Restaurant search filters results to `ARA_ALLOWED_LOCALITIES` (defaults to `ARA_PILOT_CITY`); it does not silently use another city's time zone. Separate regions and self-service onboarding are later work.

Generate a new key once:

```bash
npm run resy -- init-key
```

This saves `ARA_CREDENTIAL_KEY` without printing it. Back up the key privately, separately from the database. Do not replace it after connecting an account: old encrypted records would become unreadable. Do not reuse the legacy application's encryption key.

## 2. Connect your own Resy account privately

This is a developer pilot using the authenticated Resy web endpoints described by the [Linq reference agent](https://github.com/linq-team/linq-resy-agent). It is not a Resy-issued partner integration or a promise that these endpoints will remain stable. If Resy rejects access, stop and use Resy directly; Ara does not bypass access controls.

1. Sign into your own account at [Resy](https://resy.com/) in your browser. Complete any normal verification there.
2. Open browser developer tools → **Network**. Reload the page and inspect a request to `api.resy.com` made by your authenticated session (for example, the profile request).
3. From its request headers, put the key inside `Authorization: ResyAPI api_key="…"` into `RESY_API_KEY` in `.env.local`. Do not include the wrapper text or quotes.
4. Copy your session's `x-resy-auth-token` value. Do not paste it into the group, this conversation, a command argument, or a committed file.
5. Run this locally in an interactive terminal:

   ```bash
   npm run resy -- connect
   ```

6. Paste the token at the hidden prompt and press Enter. The command verifies the account before encrypting and saving it. It never books a table. Clear your clipboard afterward.
7. Verify read-only access:

   ```bash
   npm run resy -- check
   ```

If account access expires, repeat the connection step. `npm run resy -- disconnect` deletes the saved auth token; revoke the session in Resy too. Historical encrypted reservation records remain for reconciliation and can be deleted by the operator when no longer needed.

## 3. Test AI without enabling bookings

```bash
npm test
npm run test:ai
```

The first command is offline. The second sends a small synthetic prompt to OpenAI using your configured key/model; it makes no Sendblue or Resy calls. The implementation follows the [Responses function-calling API](https://developers.openai.com/api/docs/guides/function-calling), validates every argument locally, and sets `store: false`. The AI never receives a booking mutation tool.

Set `ARA_AI_ENABLED=true`, leave `ARA_BOOKINGS_ENABLED=false`, stop the old worker with Ctrl-C, and start **one** new worker:

```bash
npm run worker
```

The webhook receiver and tunnel continue as before. Do not run M1 and M2 workers together: they share a queue, so whichever claims a message first would determine its behavior. Confirm that startup says AI enabled and live bookings disabled.

Tell the pilot group that M2 now sends recent group text to OpenAI for context. Phone numbers are replaced with local aliases in model requests, but any personal information people write into message text is still message content. The [privacy page](../src/app/privacy/page.tsx) describes this mode.

In the group, try:

> Ara, find an Italian restaurant in Brooklyn for four this Saturday around 7.
>
> The first one.
>
> That 7 PM table, please.

Ara uses previous messages for missing details and presents restaurant/slot results from Resy. Follow-ups work for 30 minutes after planning activity; “Ara, pause planning” ends that window. Other unrelated messages should be ignored. Explicitly say the date if a relative date is ambiguous.

## 4. Verify real Resy payloads before the booking gate

The adapter is intentionally conservative. It currently executes only ordinary tables whose details explicitly report `payment.is_paid=false` and `cancellation.fee.amount=0`, with no unrecognized financial-policy fields. Missing terms are **unknown**, not free. Deposits, prepaid experiences, nonzero cancellation fees, and unrecognized policy structures produce a truthful handoff to Resy, with no mutation.

These contract parsers have synthetic test coverage; the actual account's profile, search, slot, details, success and reservation-list formats still need live validation. If a check fails, adjust the adapter using a **sanitized** real response and add a regression fixture before enabling bookings. Never save auth headers, profile PII, card data, or raw tokens in a committed fixture. Do not weaken the fee guard merely to get a test through.

The local quote lasts at most five minutes. When Resy omits an unambiguous expiry, it lasts only one minute. This does not hold inventory. Ara always refreshes the exact time/seating and account/terms before attempting a booking; it never substitutes the nearest time.

## 5. Deliberately authorize one live test

Only after read-only access and the actual policy fields are verified:

1. Pick a table the owner actually wants, with understood management/cancellation terms.
2. Set `ARA_BOOKINGS_ENABLED=true` and restart the single worker.
3. Ask Ara to recheck the exact table and show a new quote.
4. The designated owner approves the displayed venue, date/time/time zone, party size and terms by saying **“Ara, book it”** or **“Ara, book ABCD1234”** using the displayed quote code. A bare “yes”, another person's request, a message sent before the quote, or a conditional “book it if…” cannot commit a booking. The model does not decide authorization.
5. Confirm that Ara's response matches a real reservation in the owner's Resy app. Depending on Resy's response, Ara shows a public Resy reference or its own local record ID; private management tokens remain encrypted.
6. Manage or cancel the test directly in Resy as appropriate. Conversational cancellation is not implemented. A previously recorded confirmation is historical; Ara directs the owner to Resy for later changes.
7. Record the evidence in `EXECUTION_PLAN.md`. Only then can M2's live gate be accepted.

## Recovery and operator commands

```bash
npm run resy -- status
npm run resy -- reconcile
npm run queue
```

Ara records a booking attempt as `unknown` **before** sending the mutation. Any timeout, process interruption, or ambiguous provider result holds further account bookings. It never blindly retries a reservation. `reconcile` performs read-only lookup after a two-minute grace period and can confirm a unique exact venue/date/time/party-size match. No match, multiple matches, an unsupported response, or an unavailable provider leaves the hold intact. Absence from one provider response is not proof that booking failed.

There is deliberately no general “retry booking” command. If an unknown attempt cannot be reconciled, the owner must check Resy directly and the operator must investigate before any data correction. A confirmed reservation also blocks another Ara booking for the same account/date in this initial pilot, even if canceled outside Ara. Do not delete attempt rows to force a retry; preserve the audit evidence and implement a verified resolution path when needed.

Sendblue delivery recovery remains separate: use [the messaging runbook](SENDBLUE_SETUP.md). A failed confirmation message does not undo the reservation. Retrying a known-rejected outbound message uses its persisted text and never repeats the booking. An uncertain message send still needs provider verification before retry.

To return to M1, set `ARA_AI_ENABLED=false` and restart the worker. This does not cancel existing reservations or erase booking records. To pause new bookings while retaining AI search, set only `ARA_BOOKINGS_ENABLED=false` and restart.

## Current read-only validation result

The connected account profile returns HTTP 200; `POST /3/venuesearch/search` returns HTTP 403 Forbidden. No reservation was attempted. Ara now distinguishes access denial from an HTTP 401 expired/invalid login. A profile check alone does not establish access to search or booking.

The user subsequently verified that the browser uses the same search URL/method and API key, and supplied its successful search payload. Replaying that exact payload through the read-only diagnostic still returned HTTP 403 while the profile returned HTTP 200. Adding its availability, pagination, slot-filter, and radius fields therefore did not resolve the denial. The remaining request/session/environment differences have not yet been isolated; no speculative production payload change was made.

To diagnose, sign into Resy in the browser, perform a normal restaurant search, and inspect the successful search request in Network. Verify its URL/method and update the local `RESY_API_KEY` from that request if different. Do not paste request headers, session tokens, or a “Copy as cURL” command into chat. If the browser itself cannot search, resolve that with Resy before proceeding. Rerun `npm run resy:validate` after the configuration is corrected; it is read-only and cannot call the booking endpoint.

## Optional browser fallback

The API path remains primary. For read-only failures, [Steel browser fallback](BROWSER_FALLBACK.md) adds deterministic Playwright, DOM inspection, bounded DOM/vision model assistance, and human handoff. It uses isolated cloud sessions, never the personal browser. Browser search and API access are validated separately; automatic browser checkout remains gated and cannot retry an uncertain API booking.

Saved Steel login reuse and the Balthazar checkout screen were observed in a guarded probe. Resy auth refresh is necessary; blocking it makes the session appear logged out. The observed late-cancellation fee was $30 plus tax per guest. No reservation was submitted. See the [checkout diagnostic](BROWSER_FALLBACK.md#guarded-checkout-diagnostic); the narrow browser financial parser is implemented and passed a live quote-only check. Live submission and confirmation remain gated.

The current browser checkout did not expose a saved payment method. The owner should verify payment setup privately in Resy, then rerun the browser quote diagnostic. Ara will not issue an actionable approval while payment evidence is missing. Browser approvals require the exact quote code and explicit acceptance of displayed fees/cancellation terms; plain “book it” is insufficient. Keep bookings disabled until a specific real test reservation is selected and authorized.

Payment follow-up (September 25, 2026): after the owner added a payment method, the same live Steel quote-only check passed with `requiresPaymentSetup=false`. The Balthazar September 27 / two guests / 09:00 Indoor policy remained no upfront payment and $30 plus tax per guest after September 26 at noon New York time. No reservation was submitted. Payment evidence is now verified; next is selecting and explicitly authorizing a real test reservation, then validating submission and confirmation. Live bookings remain disabled.

Controlled browser booking succeeded: the explicitly approved Mira table was confirmed by Resy with reference `932143695`. The operator runner used one Steel checkout session and the shared durable ledger. This validates real browser submission/confirmation; global worker booking flags remain disabled pending the live group-message acceptance test.
