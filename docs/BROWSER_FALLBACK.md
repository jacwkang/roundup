# API-first automation with Steel and Playwright

Ara keeps its existing Resy API adapter. When a **read-only** API request is unavailable, denied, or has an incompatible response, an opt-in adapter can use an isolated Steel cloud browser. It never attaches to the operator's Chrome, reads a personal profile, or launches local Chrome. Codex receives the same remote-browser capability through a small project-owned MCP server.

## Escalation order

1. **Official API when available.** Prefer a supported provider API. The existing Resy adapter uses authenticated web endpoints, not an established official partner API; retain it as the first transport while its access is validated.
2. **Deterministic Playwright.** Reuse known navigation and accessible controls in Steel. No model call or screenshot is needed.
3. **DOM inspection.** Inspect visible restaurant links and a bounded, redacted page summary. Never upload full HTML, cookies, local storage, auth headers, or input values to a model.
4. **Small DOM summary → LLM.** Only if deterministic extraction is insufficient. The model can select observed candidate IDs; it cannot invent URLs, execute code, enter credentials, or commit bookings.
5. **Screenshot / computer-use.** Last resort, explicitly enabled, limited to one masked viewport image. Codex can use it to understand the remote page and navigate an already-observed venue link; there is no arbitrary coordinate-click or OS-control tool. The worker's vision call also selects only observed candidates.
6. **Human handoff.** Use a direct Resy link or private Steel viewer when the page cannot be interpreted reliably, requires login/verification, presents a challenge, or needs an unvalidated checkout action.

A successful empty API result stops immediately: no inventory is not an API failure. An uncertain booking must be reconciled, **never repeated in the browser**. Browser-derived venue IDs carry explicit provenance and cannot be passed to the API as real Resy IDs. Browser search is discovery, not live slot verification or a reservation.

## Implemented and remaining

Implemented: Steel session creation/CDP connection/cleanup; encrypted owner-scoped browser context; read-only API fallback; deterministic search, DOM extraction, bounded candidate-selection and optional vision; explicit handoff; Codex MCP; offline contract and safety tests.

**Still gated by live Steel/Resy validation:** fee/cancellation interpretation, browser checkout execution, and browser confirmation/reconciliation. Read-only slot extraction has been validated on Balthazar for two dates/party sizes. It cross-checks the selected date/guest/time controls, venue heading, and each displayed time/seating against its DOM inventory tuple, and waits for two matching snapshots. Different or incomplete DOM contracts hand off instead of guessing; a missing result is not reported as sold out. Unsupported checkout contracts still hand off with a Resy link. It does not mark a handoff as booked or satisfy M2's live reservation gate. The existing API booking path and its owner authorization/durable attempt boundary are unchanged. Enabling browser search does not enable browser booking; `ARA_BOOKINGS_ENABLED` remains a separate gate.

The browser checkout path now shares the durable pre-mutation attempt, exact owner authorization, fresh terms check and confirmation storage of the API path. The controlled operator submission test has now passed; the complete live group-message flow remains to be tested. The Codex MCP still has no general-purpose click or booking tool.

## Setup

1. Create a Steel account and a key at [Steel API keys](https://app.steel.dev/settings/api-keys).
2. Add it privately to `.env.local`:

   ```dotenv
   STEEL_API_KEY=your-key
   ARA_BROWSER_ENABLED=true
   ARA_RESY_CITY_SLUG=new-york-ny
   ARA_BROWSER_DOM_LLM=true
   ARA_BROWSER_SCREENSHOTS=false
   ARA_BROWSER_DAILY_MODEL_CALLS=10
   ```

   Keep `ARA_BOOKINGS_ENABLED=false` during validation. The browser flag only affects the worker when `ARA_AI_ENABLED=true`. The existing owner, encryption key, model and database configuration are reused.
3. Run `npm run browser -- check`. This opens an isolated Steel session, checks CDP and the public Resy page, then releases the session. It does not validate search or bookings.
4. If Resy requires login, run `npm run browser -- login` in your own interactive terminal. Open the private viewer URL and sign into your account there. Afterward type `save` at the terminal prompt. Ara encrypts Steel's session context in SQLite and releases the browser. Saving context is not proof that login or booking access succeeded. No password or OTP is passed to the model.
5. Run `npm run browser -- search Balthazar` for a **browser-only diagnostic**. Normal worker requests still try the API first. A successful search must return actual rendered venue links; otherwise it reports a handoff.
6. Restart the single worker to apply settings. Never run competing M1/M2 workers against the same queue.

`npm run browser -- disconnect` removes saved browser context. Revoke the login at Resy as appropriate. The Resy API token is separate and is managed by `npm run resy -- disconnect`.

Steel processes the browser's authenticated cookies and page contents while the session runs. These credentials remain encrypted locally between sessions, but this is a trusted external service, not local-only processing. Use the designated account only. Keep viewer URLs out of the group chat and source control. Steel may retain session data under its account settings/policies; local deletion does not delete provider-side records.

## Codex connection

The `ara-steel-browser` MCP server exposes seven small tools: `start`, `navigate`, `inspect_dom`, `open_venue`, `search`, `screenshot`, and `release`. It carries no API booking tool. It resolves its environment/database relative to this repository even if Codex starts it elsewhere. `STEEL_API_KEY` is loaded from `.env.local`, not placed into Codex config or command arguments.

From the project directory, install the server with absolute paths (replace the paths for another checkout):

```bash
codex mcp add ara-steel-browser -- node --import /absolute/path/to/ara/node_modules/tsx/dist/loader.mjs /absolute/path/to/ara/scripts/browser-mcp.ts
```

Restart/reconnect Codex to discover the new tools. Ask it to use `ara-steel-browser` for Ara's Resy fallback and inspect the DOM first. All tool navigation is limited to Resy discovery pages; login happens through the private human setup flow. Screenshot requests require a reason and a preceding DOM inspection. Session handles/viewer URLs are private operator information.

`npm run test:browser-mcp` checks MCP startup and tool discovery from another working directory without creating a cloud session or spending model tokens.

## Limits and recovery

- Worker sessions: 90-second provider TTL; human login: five-minute provider TTL. Release in `finally`, including CDP connection failure. The Steel SDK uses Node’s native fetch transport; release has a separate 60-second timeout and runs before CDP disconnect. If release fails, check Steel's dashboard; provider TTL remains the backstop.
- Worker model budget: at most one DOM and one image request per search, 400 output tokens each; at most 10 attempts per UTC day by default, persisted in SQLite. Errors count against the cap. Setting the cap to zero disables model escalation.
- DOM input: at most 20 candidates and a 6,000-character request. Screenshot: at most 1100×800 JPEG, only the visible main content, with form fields/header/nav masked. No screenshots are stored on disk.
- Codex tools: one active remote session, at most 20 actions and one screenshot per session. Codex's own reasoning/token usage is managed by Codex, not Ara's worker ledger.
- No auto CAPTCHA solving, proxy rotation, credential guessing, or repeated attempts through a provider challenge. Hand off to the owner.
- API mutations never switch to the browser on error. Unknown results stay held until verified. Discovery tooling cannot clear booking holds.
- Server logs contain stages and generic error codes, not CDP URLs/API keys, raw SDK errors, cookies or page bodies.

## Sources

Implementation follows [Steel's Playwright cookbook](https://docs.steel.dev/cookbook/playwright), [Steel context reuse](https://docs.steel.dev/overview/sessions-api/reusing-auth-context), [Playwright authentication](https://playwright.dev/docs/auth), [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision), and [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

## Live evidence

Steel/CDP connection and session release passed with Node’s native fetch transport. An isolated Balthazar search returned `https://resy.com/cities/new-york-ny/venues/balthazar-nyc`. The repeated search completed through Playwright and deterministic DOM inspection only: zero model calls and zero screenshots. Browser fallback is configured locally; AI processing and live bookings remain disabled. Read-only availability also passed for September 26, 2026 / two guests (9 options) and September 27 / four guests (13 options), with Indoor/Outdoor seating preserved and local times converted correctly. These were live observations, not held inventory. Both checks used only Playwright and DOM inspection. A later guarded probe reused the owner login and reached the Balthazar checkout without a login prompt. It observed a $30 plus tax per guest late-cancellation fee for September 27 / two guests / 09:00 Indoor (deadline September 26 at noon). No final submission occurred. The narrow financial parser subsequently passed a live quote-only test; actual booking execution and confirmation still require validation.

### Read-only availability diagnostic

```bash
npm run browser -- slots 'https://resy.com/cities/new-york-ny/venues/balthazar-nyc' 2026-09-27 4 Balthazar
```

Use a future date when testing. The venue name must match the page heading. This command never clicks reservation or Notify buttons, prints no inventory tokens, and releases its cloud session. The adapter supports the validated English Resy DOM contract; other layouts/locales, ambiguous controls, unsupported inventory formats, or uncertain empty results hand off. Date and guest count come from the rendered controls, not just the URL. The response preserves the configured venue time zone and marks the venue as browser-sourced.

### Guarded checkout diagnostic

After saving the owner login, run:

```bash
node --import tsx scripts/checkout-probe.ts 'https://resy.com/cities/new-york-ny/venues/balthazar-nyc' 2026-09-27 2 Balthazar
```

Use a future date. This operator-only diagnostic opens the first verified slot, inspects the checkout iframe, and stops before Reserve Now. It is not wired into the worker and does not return a booking quote. All non-read requests are blocked except the exact Resy auth-refresh and discovery/details endpoints; normal browser mutation guards also remain active. Blocking `/3/auth/refresh` falsely made the reused login appear signed out during the initial probe. Successful inspection saves refreshed context encrypted, reports only public slot/policy evidence, and releases the session. Missing login, ambiguous controls, a cookie overlay or an unsupported policy layout fails closed; do not treat that as a sold-out result. The displayed policy remains subject to human review.

### Browser booking implementation and remaining gate

The worker can prepare browser quotes for the observed ordinary-table, zero-upfront-payment contract with a displayed conditional cancellation fee. It cross-checks the DOM policy against the browser's own Resy details response, requires known payment/cancellation/change fields, and rejects unfamiliar charges or event inventory. The full policy, deadline in the venue timezone, per-guest fee and party total are disclosed. Provider data stays local; there is no LLM or screenshot in checkout. Optional restaurant marketing is unchecked.

Only the designated owner can authorize an already-delivered quote with `Ara, book QUOTECODE and I accept the displayed fees and cancellation terms`. The account context, payment evidence, exact slot and financial policy are fingerprinted and refreshed. The durable attempt is written before opening the final checkout. One POST to the exact Resy booking endpoint is allowed, for the fresh token, from the checkout frame, before the approval expires. All other mutation requests remain blocked. A click or HTTP 200 alone is not confirmation: the response must contain a reservation ID or private management token, which is encrypted in the existing booking record. Failure stays unknown; no retry, alternate transport, or API matching against synthetic venue IDs.

`npm run browser -- quote URL YYYY-MM-DD PARTY VENUE_NAME` performs a quote-only diagnostic for the first available slot, without submitting. Append `--time=17:00` to require an exact venue-local time; an unavailable time hands off without substitution. Live validation passed for the observed Balthazar policy, but `user.payment_methods` was null. Ara treats that as missing payment evidence, not proof the account has no card: it requires private payment setup/verification and a fresh quote, and issues no actionable booking approval until evidence is available. Saved-payment evidence and a final booking POST/confirmation have since passed a controlled live Mira reservation test. `ARA_BOOKINGS_ENABLED=false` remains configured locally. A later explicitly approved Mira reservation was confirmed; the global worker booking flag remains disabled.

Payment follow-up (September 25, 2026): after the owner added a payment method, the same live Steel quote-only check passed with `requiresPaymentSetup=false`. The Balthazar September 27 / two guests / 09:00 Indoor policy remained no upfront payment and $30 plus tax per guest after September 26 at noon New York time. No reservation was submitted. Payment evidence is now verified; next is selecting and explicitly authorizing a real test reservation, then validating submission and confirmation. Live bookings remain disabled.

Mira policy support: the guarded browser adapter also recognizes the observed zero-upfront, no-cancellation-charge policy asking guests to cancel at least 24 hours ahead. It requires the exact displayed policy and structured fee-null/zero-payment evidence; a missing fee alone never means free. The October 2, 2026 / 17:00 / two guests Dining Room slot was observed in checkout, with no submission. Exact-time operator diagnostics accept `--time=17:00` and never substitute a different time.

### Private operator submission

`scripts/book-approved.ts APPROVAL_JSON --submit-approved` is an operator-only runner for an exact reservation explicitly approved outside Sendblue. The private JSON records venue URL/name, day/time/party/seating, exact reviewed terms, expiration and approval evidence. It refreshes availability and terms, rejects any mismatch, and records the encrypted approval plus an unknown attempt in the shared booking ledger before calling the guarded browser submitter. Operator rows use a separate chat label and negative sequence numbers; they do not fabricate Sendblue messages or delivery receipts. Existing and unresolved attempts block both operator and worker submissions. Booking enablement is scoped to this process; `.env.local` flags stay unchanged. Never rerun an uncertain attempt.

Controlled Mira submission test: the owner explicitly approved October 2, 2026 at 17:00, two guests, Dining Room, with no upfront payment or cancellation charge. The operator runner revalidated terms and wrote shared attempt `09423984` before invoking browser submission. No provider confirmation was obtained; the attempt remains unknown and blocks further bookings. A read-only API reservation lookup returned zero exact venue/date/time/party matches. This does not prove that submission failed; do not retry until privately reconciled. The live confirmation gate did not pass.

Checkout interaction fix: Resy's booking iframe can be taller than the outer viewport. Before quoting/submitting, Ara scrolls the iframe's outer container to its end, scrolls the specific Reserve Now control into view, and performs a Playwright trial actionability check without clicking. The external viewport remains 1100×800; no force-click, arbitrary script execution from page content, screenshot, or LLM is used. A mutation-blocked dry run verified the normal click reaches the exact `/3/book` endpoint from the checkout frame.

Private reconciliation: `scripts/reconcile-approved.ts ATTEMPT --owner-confirmed-none` requires the operator to have an explicit owner report of no reservation, then performs a fresh exact-tuple API lookup using the observed provider inventory venue ID. Only zero matches plus that owner evidence can mark the attempt `not_booked`; its encrypted approval and reconciliation audit remain stored. Active unknown/confirmed attempts still block new booking. A zero-match API response alone never clears a hold.

Preparation failures are now distinct from uncertain submission: `BrowserPreflightError` can only originate while opening/checking a checkout, before its submission gate can be armed. These failures are recorded as `not_booked` with retained evidence. Failures after entering submission still remain unknown and are never automatically retried. The second Mira attempt predates this classification and remains held; do not retroactively assume it is safe based only on a zero-result API lookup.

Successful follow-up: the operator runner now performs final validation and submission in the same prepared Steel session, and writes the durable shared attempt immediately before enabling the one-use request gate. The Mira reservation returned Resy confirmation `932143695`; its record and private management data are stored in the encrypted booking ledger. Four bounded trial actionability checks accommodate layout shifts without sending clicks. Read-only availability stabilization waits up to 20 seconds. The worker’s separate quote/book flow remains protected but still requires a live end-to-end group test.
