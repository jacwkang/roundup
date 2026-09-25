# Ara — Group Chat Hangout Assistant

> **Product requirements document · Updated September 24, 2026**
>
> This README is the source of truth for product scope, behavior, and priorities. It supersedes conflicting requirements in `docs/archive/MVP_ROLLOUT_PLAN.md`, `docs/archive/COMPETITIVE_ANALYSIS.md`, and the existing web prototype. Requirements below describe the target product, not functionality already shipped.

## Product vision

Add Ara's phone number to a friend group's iMessage/text conversation and plan a hangout through natural language. Ara tracks when everyone is free, finds things the group would enjoy, helps friends agree on a plan, and books reservations when asked—all in the conversation where planning already happens.

The primary interface is the group chat. Friends should not need to install an app, create a Ara account, connect a calendar, fill out a form, or visit a voting page to participate. A private setup link is acceptable when a reservation provider requires account connection.

**Messaging foundation:** Sendblue, subject to validating group API access and the real group-chat experience. **Initial reservation integration:** Resy, using the [Linq Resy agent](https://github.com/linq-team/linq-resy-agent) as an implementation reference.

## Users and outcome

Ara serves existing friend groups who lose momentum coordinating schedules, choosing somewhere to go, and making the booking. It reduces the work normally carried by one organizer while letting every friend participate naturally.

Success means a concrete hangout: an agreed time, place or activity, attending group, and reservation where needed.

## Release scope

**V1 is deliberately small: basic Sendblue group messaging plus AI-powered Resy bookings.** Start with one allowlisted friend group of roughly 3–6 people, one assistant number, and one designated booking owner whose Resy account is connected privately. This is a pilot assumption, not a platform limit.

In V1, friends supply or agree on a date, time, location/restaurant, and party size in chat. Ara asks for missing booking details, searches Resy, checks slots, books an explicitly authorized table, and posts the real confirmation. Keep enough durable conversational context to handle follow-up messages; a full availability engine is not required.

Automatic availability coordination, general activity discovery, reminders, Google Maps list links, Ticketmaster, OpenTable, other booking providers, and self-service multi-account onboarding are **later work**. V1 does not need them to ship. Reservation changes and conversational cancellation are also later; the pilot must still give the owner a way to manage/cancel the reservation directly with the provider.

See [EXECUTION_PLAN.md](EXECUTION_PLAN.md) for milestone deliverables and release gates. This README remains authoritative for product scope.

## Target experience beyond V1

1. **Add the number.** A friend adds Ara to an existing group chat, or starts a new group with Ara and their friends if the messaging service requires it.
2. **Start planning.** Someone says, “Ara, help us find something fun to do this weekend.” Ara asks only for missing details such as city, date range, or rough budget.
3. **Collect availability.** Friends respond conversationally: “Friday after 7,” “Saturday works,” or “Actually, I can't do Friday anymore.” Ara maintains each person's latest availability and identifies overlaps.
4. **Find options.** Ara suggests a short list of activities that fit the group's schedules, location, budget, and preferences, explaining why each fits.
5. **Agree in chat.** Friends say, “The second place looks good,” “Too expensive,” or “Let's do dinner Saturday.” Ara tracks preferences and resolves meaningful uncertainty.
6. **Book through conversation.** A booking owner says, “Book that for the four of us at 7:30.” Ara checks the exact slot, obtains any missing account details privately, and executes the authorized reservation.
7. **Close the loop.** Ara posts the confirmed plan and booking status. Friends can request a recap, update availability, or request a reservation change or cancellation in the same thread.

### Example conversation

*The venue and availability below are fictional.*

> **Maya:** Ara, dinner in Brooklyn this weekend? Around $50 each.
>
> **Ara:** What times work for everyone?
>
> **Maya:** Friday or Saturday after 7.
>
> **Leo:** Only Saturday, and I need to leave by 10.
>
> **Sam:** Saturday works. Somewhere with vegetarian options please.
>
> **Ara:** Saturday 7–10 works for all three of you. I'll look for vegetarian-friendly dinner options around $50 each.
>
> **Ara:** Juniper has a 7:30 table for three and fits the budget. Orchard has a 7:00 table but is farther away. Which sounds better?
>
> **Maya:** Juniper! Book 7:30 for three under my account.
>
> **Ara:** Booked: Juniper, Saturday [date], 7:30 PM [local time zone], party of three, under Maya. Confirmation: [provider confirmation].

If Maya's account needs connecting, Ara requests that privately before booking. If the provider introduces a fee or changes the requested details, Ara asks Maya to approve those terms first.

## Target product requirements and release assignment

The requirements below describe the full direction. V1 implements only the group messaging and Resy booking subset defined above and in the V1 acceptance criteria. Availability coordination, broader discovery, booking management, and reminders are later milestones.

### Group conversation

- Receive messages through Sendblue, identify the sending participant and conversation, and reply to that same group.
- Introduce Ara as an AI assistant and explain briefly that it uses messages in the thread to coordinate plans.
- Respond when addressed by name, asked a planning question, or given information relevant to an active plan. Capture useful planning updates without replying to every message or interrupting unrelated conversation.
- Support ordinary language throughout; slash commands, structured forms, and native polls are not required.
- Track group membership separately from attendance. Being in the chat does not automatically mean someone is attending or available.
- Handle new participants and departures without silently changing confirmed reservations. Do not assume access to messages sent before Ara joined.
- Support requests such as “What's the plan?”, “Who hasn't answered?”, “Pause planning,” and “Stop reminding us.”
- Keep history, preferences, and plans isolated by group. Do not expose a person's other group chats or private messages.

### Natural-language availability

- Interpret dates, relative dates, time windows, exclusions, and tentative answers: “tomorrow after work,” “any evening except Tuesday,” or “maybe Sunday.”
- Resolve dates using the message timestamp and the plan's time zone. Ask when a phrase such as “after work” is too ambiguous to schedule reliably.
- Store availability per participant and plan, distinguishing available, unavailable, tentative, and unknown. Silence is unknown, never consent or availability.
- Apply corrections to the relevant person's earlier answer and recompute overlaps. Preserve the source message so changes can be explained.
- Track intended attendees and distinguish an all-attendee overlap from an option that excludes someone. Ask before proceeding with a smaller group.
- Summarize known availability and ask targeted questions instead of repeatedly asking everyone to restate their schedules.
- Scope availability to the relevant dates; a statement about this Saturday must not become a permanent weekly rule without an explicit request.
- Calendar connection is a future enhancement; conversational availability must work independently.

### Activity discovery and selection

- Find restaurants and non-dining activities such as events, shows, exhibits, outdoor activities, and casual outings.
- Use location, travel tolerance, common free time, budget, interests, dietary needs, and accessibility requirements when supplied.
- Return two or three useful choices by default, with a short reason, location, date/time, estimated price, and source link where available.
- Distinguish live reservation inventory from general recommendations. Verify time-sensitive details through a data source; label unknown prices, hours, or availability instead of inventing them.
- Refine suggestions from feedback such as “closer to downtown,” “something outdoors,” or “we went there last week.”
- Track conversational preferences without requiring formal votes. If the group disagrees, state the tradeoff and ask a focused question.
- Non-dining discovery, ticket purchasing, and booking arbitrary activities are later integrations; V1 discovery is limited to Resy restaurants.

### Reservations

- Search restaurants, check actual slots, book, retrieve confirmation, and cancel through a reservation integration. Resy is the initial target.
- Identify the booking owner and use that person's connected account. Collect credentials or verification codes only through a private, secure setup flow, never in the group chat.
- Before booking, resolve the venue, exact date, local time zone, party size, booking owner, and applicable deposit or cancellation terms.
- A clear instruction from the booking owner can authorize the exact booking; do not require redundant confirmation when all material terms are already understood. A suggestion, tentative preference, or silence is not authorization.
- Require fresh approval if the slot, party size, venue, or financial terms change. Another participant cannot commit the owner's account or cancel their booking without delegated authority.
- Report success only after the provider confirms the reservation. Persist its reference and share a concise confirmation with the group, excluding account secrets and unnecessary personal information.
- If a slot disappears, explain and offer alternatives. If a timeout leaves the result uncertain, reconcile with the provider before retrying to avoid duplicate bookings.
- Support cancellation requests from the owner, disclosing applicable fees before execution. For changes, use provider modification support where available; otherwise explain and obtain approval for the replacement/cancellation sequence.
- If direct booking is unavailable, provide a booking link and explicitly say the reservation is not yet booked. Link handoff is a fallback, not completion of the automatic-booking requirement.

### Shared plan and follow-through

- Persist the current plan, attendees, constraints, availability, candidate options, selected option, and reservation status.
- Separate planning state (`gathering`, `suggesting`, `decided`, `cancelled`) from booking state (`not_requested`, `pending`, `confirmed`, `failed`, `unknown`, `cancelled`). A decided outing may not need a reservation.
- The initial coordination milestone supports one active planning conversation per group while retaining upcoming confirmed plans. Clarify which plan a message concerns when necessary.
- Make the latest summary available on request. A schedule correction after booking must surface the conflict rather than silently canceling or replacing the reservation.
- Offer an optional reminder when a plan is finalized. Send reminders only when requested or accepted, and honor pause/stop requests.

## Sendblue integration

Sendblue is Ara's messaging provider. Group API access must be enabled for the account. Its [group guide](https://docs.sendblue.com/getting-started/groups) describes replies to groups that users add the number to; the AI Agent plan cannot create outbound groups. Pilot onboarding should have a friend add Ara or create the group from their phone.

Ara receives Sendblue message payloads and replies using `group_id`. It authenticates the webhook's `sb-signing-secret` header against a locally configured secret, as described in [Sendblue security documentation](https://docs.sendblue.com/security/). This is shared-secret authentication over HTTPS, not a signed body/timestamp scheme.

The [group-send endpoint](https://docs.sendblue.com/api/resources/groups/methods/send_message) does not document an outbound idempotency key. Ara therefore persists a send boundary and holds network timeouts, server errors, malformed success responses, and interrupted sends in an `unknown` state for operator reconciliation. It does not automatically resend uncertain messages. Duplicate inbound callbacks are suppressed using `message_handle`.

Validate the following with an actual Sendblue number before marking M1 complete:

- Group API access on the chosen plan and adding Ara to an existing or newly user-created group.
- Sender attribution, inbound receiving-line fields, and replies to the originating group.
- Real webhook secret delivery and restart behavior.
- Mixed-device/transport behavior separately; only claim configurations actually tested.

The [Linq Resy agent](https://github.com/linq-team/linq-resy-agent) remains a historical reference for the Resy tool-use pattern in M2, not a messaging dependency. The existing M1 implementation uses Sendblue exclusively and does not call Linq.

## API-first browser fallback

Preserve the existing integration and prefer an official supported API wherever available. If an API read fails, escalate only as far as needed:

**Official API when available → deterministic Playwright → DOM inspection → small DOM summary to an LLM → screenshot/computer-use → human handoff.**

Browser automation runs in **Steel cloud sessions**, isolated from the operator’s personal browser. Use the same external connection for Codex through the project MCP server. Routine navigation/extraction uses DOM and accessible controls; screenshots and model reasoning are bounded last resorts. Page contents are untrusted data. Login, verification challenges, unclear terms, and unsupported checkout screens require human handoff.

Maintain the same booking owner, exact authorization, financial-term checks, durable attempt boundary, and real confirmation requirements across transports. Never retry an uncertain API booking through a browser. A browser result or handoff link is not a reservation. The existing Resy web endpoints are not established official partner access; browser support does not change that status.

Availability handoffs must state that no booking was attempted; reserve uncertain-booking warnings for unresolved submissions. Browser inventory validation supports explicitly verified, venue-specific seating-label aliases while retaining exact date, time, party-size and inventory checks.

See [current harness implementation](docs/HARNESS_IMPLEMENTATION.md) for the actual chat, API fallback, DOM inspection, browser control, quote, submission, and human-handoff flows.

**Current implementation:** optional read-only API fallback, Steel session lifecycle, encrypted browser context, staged restaurant discovery, bounded DOM/vision interpretation, and Codex MCP tools. Read-only browser slots are validated for Balthazar using the exact rendered date, guest count, time and seating, without model calls or screenshots. Unsupported layouts hand off. A guarded operator diagnostic has reused the saved login and inspected the checkout cancellation policy. Browser checkout now has a narrow, locally parsed zero-upfront-payment/conditional-cancellation-fee contract, explicit quote-code fee acceptance, fresh term/account checks, a one-use submission gate, and provider confirmation parsing. Unsupported terms or missing payment evidence hand off. An explicitly authorized Mira reservation has now returned a real Resy confirmation through the guarded browser path. The API booking path remains in place. See [Steel setup and limits](docs/BROWSER_FALLBACK.md).

## Proposed architecture

For V1, keep this in one application with durable storage and a small background processing path. The activity discovery adapter is Resy-only; structured availability and the reminder worker are deferred. A separate queue service or new production database is not a prerequisite if the pilot deployment can process persisted events reliably.

```text
Friend group in Messages
        ↕
Sendblue messaging API + webhooks
        ↕
Authenticated webhook ingestion → durable event queue
        ↕
Conversation orchestrator + AI tool calling
        ├── Group, participant, availability, and plan store
        ├── Activity discovery adapters
        ├── Reservation adapter + private account connection
        └── Outbound message and reminder worker → Sendblue → group
```

- Keep messaging behind a provider adapter and key conversation state by provider chat ID, not one sender's phone number. Map participant handles to internal identities without guessing that different handles belong to the same person.
- Persist events and acknowledge webhooks promptly; process messages in order per chat and deduplicate by provider event/message ID. Ignore outbound echoes to prevent response loops.
- Use the model to interpret language and select tools. Validate arguments and enforce authorization, booking rules, and state transitions in application code.
- Persist structured plan facts with participant identity, source message, interpreted dates/time zone, and uncertainty. Conversation history alone is not the plan database.
- Make booking operations idempotent and reconcile uncertain results before retrying. Save the booking result before sending confirmation.
- Encrypt provider credentials separately from chat history. Redact secrets and sensitive message content from operational logs. Support disconnecting accounts and deleting stored personal data.
- Continue from persisted state after restarts. Select production storage and worker infrastructure during implementation; do not copy the reference agent's in-memory storage into production.

## Scope boundaries

**V1:** one Sendblue number, one small allowlisted group, sender-aware conversational context, AI tool calling for Resy restaurant search and slot lookup, one privately connected booking owner, authorized booking, durable confirmation, and clear failure handling.

**Later:** natural-language availability coordination, Google Maps shared/saved list links, broader activity discovery, Ticketmaster, OpenTable and other reservation providers, reservation changes/cancellation through Ara, reminders, calendar sync, multiple groups and booking owners, recurring hangouts, ticket purchases, and payments.

The former organizer dashboard, mandatory Google sign-in, invite-link onboarding, and web voting flow are no longer the primary product journey. Web pages may support private account setup and optional plan details, but must not be required for ordinary group participation.

## V1 acceptance criteria

1. A small allowlisted group can add Ara to a supported Sendblue conversation (or create a group including Ara) and receive replies in the same thread, with sender identity preserved.
2. Friends can request a restaurant booking in ordinary language. Ara retains follow-up context and asks for missing date, time/time zone, location or venue, party size, and booking owner without requiring forms or calendar access.
3. Restaurant results and slots come from Resy. Ara never invents availability or presents a booking link as a confirmed reservation.
4. Only the designated owner can authorize a booking against their connected account. Changed details or newly disclosed financial terms require fresh approval.
5. A real authorized booking produces a stored provider confirmation and a group reply with the exact reservation details. The owner can manage/cancel it through the provider.
6. Duplicate webhooks and a booking timeout cannot trigger blind repeat bookings. Unknown results are reconciled before another attempt; missing credentials and unavailable slots produce an honest next step.
7. Restarts preserve relevant context and booking results. Outbound echoes do not loop, non-allowlisted chats cannot invoke bookings, and credentials never appear in group messages or logs.
8. One real small-group end-to-end pilot passes on the selected messaging transport. Mixed-device support is claimed only after a separate successful test and does not block an iMessage-only first pilot.

## Success measures

Measure the pilot around completed hangouts:

- Percentage of activated groups that reach an agreed plan.
- Time and number of coordination messages from first request to agreed plan.
- Percentage of authorized booking attempts that produce confirmed reservations.
- Repeat planning by the same group and feedback on usefulness and interruptions.
- Failure signals: incorrect availability attribution, duplicate bookings, false confirmations, and cross-group data exposure.

Set numerical launch targets after the initial pilot baseline. Duplicate bookings, false confirmations, and cross-group exposure are release-blocking defects.

## Repository status and local development

**M1 is implemented and locally tested; two participants have confirmed live Sendblue replies, and the user has accepted M1 as working. The original third-sender check remains a follow-up.** The app now contains a secret-authenticated Sendblue webhook receiver, a durable SQLite message queue, an outbound worker, and a small Ara landing/privacy page. The former Google sign-in, calendar integration, organizer dashboard, invite links, voting, discovery, and reservation stubs have been removed from active code.

With AI disabled, M1 replies with deterministic connectivity messages when someone includes “Ara”. The opt-in M2 implementation adds OpenAI interpretation, private encrypted Resy credentials, restaurant/slot tools, owner-authorized booking attempts, and reconciliation. Automated tests and a live OpenAI check pass. **Resy profile access is verified, but server-side search returns 403. Isolated Steel browser discovery has returned a real Balthazar venue link using DOM inspection without model calls or screenshots; read-only slots are also verified for two dates/party sizes. Saved-login reuse and the checkout screen have now been observed in Steel. The browser quote adapter has also passed a live terms-only check. It initially withheld booking for missing saved-payment evidence; after the owner added payment, a fresh live quote verified that evidence successfully. A controlled operator booking at Mira now passed browser submission and provider confirmation. The complete natural-language group-message booking flow still needs live acceptance testing, so M2 is not accepted yet.**

**M2 setup: [private Resy connection and testing](docs/RESY_SETUP.md).** Enable AI and bookings separately. The initial booking adapter accepts only explicitly understood zero-upfront-payment, zero-cancellation-fee tables; other or unknown terms require a direct Resy handoff. The owner can approve a displayed quote with “Ara, book it”; the model cannot authorize a booking. Multi-region search, deposits/fee-bearing tables, and more flexible authorization phrasing need additional validated support. These limitations do not replace the target V1 acceptance criteria above.

**Start here: [Sendblue setup and testing guide](docs/SENDBLUE_SETUP.md).** It covers account/number provisioning, the webhook subscription, group allowlisting, the two local processes, and a live test checklist.

Requires Node.js 22 or later:

```bash
npm install
npm test
npm run test:smoke
npm run build
```

The Sendblue smoke test uses temporary storage and a mock transport; it needs no credentials and sends no real messages. For a live test, configure `.env.local` from `.env.example`, then run `npm run dev` and `npm run worker` in separate terminals.

Current stack: Next.js, React, TypeScript, SQLite (`better-sqlite3`), and thin Sendblue, OpenAI Responses, and Resy HTTP adapters. The worker runs through `tsx`. Web and worker processes must share the same persistent database file. Stateless/serverless hosting alone is not supported by this pilot architecture.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local web app and webhook receiver |
| `npm run worker` | Process stored messages and send Sendblue replies |
| `npm run sendblue -- groups` | Find group IDs from recent inbound group messages |
| `npm run sendblue -- init-secret` | Generate and save the local webhook secret |
| `npm run sendblue -- subscribe https://YOUR-ORIGIN` | Append the authenticated receive webhook |
| `npm run queue` | Inspect processing state without printing message content |
| `npm run queue -- retry SEQ` | Retry a known rejected send after fixing its cause |
| `npm run queue -- resolve SEQ sent HANDLE` | Mark an uncertain send as confirmed after provider verification |
| `npm run queue -- resolve SEQ not-sent` | Requeue only after verifying the provider did not send it |
| `npm run resy -- init-key` / `connect` / `check` | Private Resy setup and read-only verification |
| `npm run resy -- status` / `reconcile` | Inspect and reconcile persisted booking attempts |
| `npm run browser -- check` / `login` / `search Balthazar` | Isolated Steel browser setup and discovery diagnostics |
| `npm run test:browser-mcp` | Local Codex MCP handshake; no cloud session |
| `npm run test:ai` | Small live OpenAI check; no messages or bookings |
| `npm test` | Automated messaging, AI orchestration, and booking safety tests |
| `npm run test:smoke` | Three-sender ingestion → restart → mock outbound test |
| `npm run typecheck` / `npm run lint` / `npm run build` | Static checks and production build |

Older research and rollout documents live in `docs/archive/` as historical context. Before cleanup, the existing source (including local edits) was backed up to the ignored `data/legacy-backup/pre-m1-source.tar.gz`. The old database and `.env` were left untouched; Ara uses `ARA_DATABASE_PATH` (default `./data/ara-sendblue.db`) and ignores old Google and Linq settings. Do not reuse the old messaging database; startup rejects a legacy store to prevent replay across providers.

See [EXECUTION_PLAN.md](EXECUTION_PLAN.md) for milestone status and the remaining live validation gate.

Browser fee-bearing quotes require the connected owner to send `Ara, book QUOTECODE and I accept the displayed fees and cancellation terms` after Ara has delivered that exact quote. Plain “book it” cannot authorize a browser checkout. The approved quote binds the slot, saved browser account context, payment evidence and policy. Booking transport is chosen before mutation and is never retried through another transport. Unknown browser attempts require private Resy reconciliation; synthetic browser venue IDs are never used to match API reservations.

Mira policy support: the guarded browser adapter also recognizes the observed zero-upfront, no-cancellation-charge policy asking guests to cancel at least 24 hours ahead. It requires the exact displayed policy and structured fee-null/zero-payment evidence; a missing fee alone never means free. The October 2, 2026 / 17:00 / two guests Dining Room slot was observed in checkout, with no submission. Exact-time operator diagnostics accept `--time=17:00` and never substitute a different time.

Latest live result: the designated owner’s approved Mira reservation was confirmed through Steel/Playwright on September 25, 2026. The successful operator flow keeps fresh validation and final submission in the same session. Global live booking remains disabled; AI messaging is now enabled for the current pilot group; this controlled operator test does not by itself validate the complete group-message flow.
