# Ara — Execution Plan

> Updated September 24, 2026 · M1 implemented; first live Sendblue reply verified; full group gate pending.
>
> [README.md](README.md) is the source-of-truth PRD. This document maps that scope into implementation milestones and supersedes the earlier `docs/archive/MVP_ROLLOUT_PLAN.md`. Update the PRD first when product scope changes.

## First release

**Ship a basic Sendblue integration that works in a small friend group, with AI-powered Resy bookings. That's the complete V1 scope.**

Pilot defaults: one assistant number, one allowlisted group of roughly 3–6 friends, one designated booking owner, and one privately configured Resy account. Start with iMessage; expand supported transports only after testing them. Friends agree on a time themselves and tell Ara what to book. Ara handles follow-up questions, restaurant search, slot lookup, explicit booking authorization, and confirmation.

V1 does not include automatic availability coordination, Google Maps lists, non-restaurant discovery, Ticketmaster, OpenTable, other providers, reminders, calendar integration, or a new dashboard. It also does not require self-service onboarding for multiple booking owners or conversational reservation modification/cancellation. Give the pilot owner a direct provider management path.

## Milestone map

| Milestone | Deliverable | Dependency | Status |
| --- | --- | --- | --- |
| M1 — Sendblue group connection | Ara receives and replies in the pilot group | Sendblue account, number, reachable webhook | Implemented; first live reply passed |
| M2 — AI + Resy booking | Natural-language request becomes a confirmed reservation | M1; working Resy account/access; model credentials | Planned |
| M3 — V1 pilot | Small group completes the flow reliably on the deployed service | M2 | Planned |
| L1 — Group coordination | Conversational availability and shared plans | V1 feedback | Later |
| L2 — Google Maps lists | Shared list links inform recommendations | Reliable list access/import approach | Later |
| L3 — More activities and providers | Ticketmaster, OpenTable, other reservations | Provider-specific access and validation | Later |
| L4 — Broader rollout | More groups/accounts and ongoing assistance | Pilot demand and reliability | Later |

M1 → M2 → M3 is the V1 critical path. Later milestones are independently prioritized after the pilot and do not delay V1. No delivery dates are assumed until provider access is verified.

## M1 — Connect Ara to a small group through Sendblue

**Implementation status:** Sendblue shared-secret webhook authentication and payload ingestion, exact group allowlisting, persistent sender-aware messages, ordered worker processing, durable send-boundary tracking, unknown-result holds, operator reconciliation, and setup/operator commands are implemented. The old web planning/auth flow and unused integrations have been removed. See [setup instructions](docs/SENDBLUE_SETUP.md).

**Local evidence:** 26 Sendblue tests, the three-sender mock smoke test (including database reopen), lint, type checking, production build, and HTTP checks for authenticated ingestion, duplicates, group isolation, and removal of the old provider endpoint.

**Live evidence (September 24, 2026, America/New_York):** the user's setup message was found in an iMessage group on the configured Sendblue shared line. After approving that group, Ara processed one new message in one attempt, stored the provider message handle with no error, and the user confirmed receiving the reply in the group. This verifies the real receive webhook → queue → worker → Sendblue group reply path and group access for this tested line.

**Release decision: M1 accepted as working by the user; proceed to M2.** Two human participants have now confirmed successful live replies (the second reported by the user). The original gate calls for three friends; the user has accepted the two-person live result as sufficient to commit M1 as working and proceed to M2. The third-sender check remains a follow-up. Record whether the group was existing or newly created and its device mix. Mixed-device support remains unverified and is not required for the initial iMessage-only pilot. Restart, duplicate, echo, and group-isolation behavior have automated coverage; the complete live checklist remains in the setup guide.

### Work

- Confirm group API access on the Sendblue plan and provision a Sendblue number and configure the inbound webhook and outbound messaging credentials outside source control.
- Validate a friend adding Ara to an existing iMessage group or creating a new group from their phone. Do not rely on outbound group creation by an AI Agent plan.
- Implement a thin Sendblue adapter for inbound messages, sender handles, chat IDs, and outbound replies to the originating chat.
- Authenticate the `sb-signing-secret` header, persist accepted events, and deduplicate by `message_handle`. Ignore outbound echoes and non-allowlisted chats.
- Persist a send boundary before the outbound request. Hold uncertain outcomes without automatic resend; require provider reconciliation before clearing the group queue.
- Preserve ordering per chat and persist enough message history for follow-ups. A durable event table and a single worker are sufficient for the pilot if the deployment supports them.
- Introduce Ara once and respond to direct requests without replying to every unrelated message.
- Document required environment variables and local/hosted webhook setup in the repository. Do not repurpose the legacy Google OAuth journey as messaging onboarding.

### Done when

- At least three friends can message Ara in the test group and receive replies in the same thread with correct sender attribution.
- Replaying an inbound event does not send a duplicate reply, and an outbound message does not create a response loop. A timeout or crash after the send boundary holds the job for review instead of resending.
- A restart retains the chat identity and accepted events. Messages from another chat cannot trigger the pilot workflow.
- The tested transport, group-creation behavior, and any mixed-device limitations are recorded.

## M2 — Add AI-powered Resy bookings

Use the [Linq Resy agent](https://github.com/linq-team/linq-resy-agent) only as a reference for the Resy tool-use pattern; messaging must use [Sendblue](https://docs.sendblue.com/). Model-provider selection is an M2 implementation decision; M1 has no model dependency.

### Work

- Use the archived reservation prototype only as a reference; active reservation modules were removed during M1 cleanup. A lookup or outbound link is not reservation execution.
- Connect one designated owner's Resy account through private setup. Encrypt credentials, exclude them from model context and logs, and bind booking permission to that owner's messaging identity.
- Add validated tools for restaurant search, live slot lookup, reservation creation, and lookup/reconciliation of the resulting booking.
- Interpret requests such as “Ara, find a table for four in Brooklyn Saturday around 7.” Resolve the exact date and local time zone, ask for missing details, and retain the answers through follow-ups.
- Offer a short set of actual Resy options, then accept an explicit instruction from the owner to book a specific option. Do not build group availability inference or formal voting.
- Validate venue, date/time, party size, account owner, and fees/cancellation terms before execution. Ask again if material details change; avoid redundant confirmation when the instruction already authorizes the exact understood terms.
- Persist a booking attempt before calling the provider. Serialize competing attempts, deduplicate repeated tool calls, and reconcile uncertain results before allowing another attempt.
- Persist the provider result before posting confirmation. Include the venue, date/time/time zone, party size, and provider reference or management link where available.
- Provide truthful failure responses for expired authentication, unavailable slots, and provider errors. When a result is uncertain, say so and suspend retries until reconciled.
- Provide the owner with a direct way to manage/cancel the reservation through Resy; automated changes and cancellation can follow later.

### Done when

- A group conversation can progress from an incomplete request through clarification and real slot selection to an authorized reservation.
- Only the connected owner can authorize use of their account, and group messages never expose credentials.
- A successful provider result is stored and accurately summarized in the group. An unavailable slot or failed request never produces a “booked” response.
- Duplicate events/tool calls and simulated timeouts do not create duplicate bookings; a restart preserves booking status.
- At least one deliberately authorized live test reservation is confirmed and then managed or canceled by its owner as appropriate. Use controlled/mocked tests for repeat failure scenarios.

## M3 — Validate and ship the V1 pilot

### Work

- Deploy the webhook receiver and processing path with persistent storage and server-side secrets. Verify the configured webhook against the deployed service.
- Run one end-to-end session with the pilot friend group: request → clarification → Resy options → owner authorization → reservation → group confirmation.
- Exercise duplicate messages, concurrent replies, provider failures, unknown booking results, restart recovery, and a request from a non-owner.
- Record the supported messaging configuration and a short runbook for expired credentials, ambiguous booking results, and disabling new bookings while investigating a failure.
- Add focused automated coverage for identity/authorization, webhook deduplication, argument validation, and booking reconciliation. Run applicable repository checks and identify unrelated baseline failures separately.
- Capture pilot feedback and the minimum operational signals: failed events, tool failures, unresolved booking attempts, and whether the group completed the flow. Avoid collecting unnecessary message content in logs.

### V1 release gate

All [README V1 acceptance criteria](README.md#v1-acceptance-criteria) pass. The group can use Ara from its normal messaging app, a real Resy booking is confirmed, and duplicate/unauthorized bookings and false confirmations are prevented. Document the tested configuration and remaining limitations.

V1 is complete at this point. Do not pull later integrations into this gate.

## Later milestones

### L1 — Natural-language group coordination

Track availability per person, tentative answers, corrections, attendance, time zones, and common free windows. Maintain a shared plan and handle disagreements through conversation. Add optional reminders and conversational reservation changes/cancellation with owner authorization.

**Exit evidence:** a group supplies different availability windows and a correction; Ara identifies a valid overlap, explains missing answers, and uses the agreed plan to drive booking.

### L2 — Google Maps list links

Let friends paste shared Google Maps saved-list links into the chat. Resolve accessible places into candidate venues, preserve their source list, and use those places to personalize recommendations and Resy searches. Distinguish “saved in the list” from “available to book.”

Start with a feasibility check for supported link formats, access permissions, and a maintainable import method. Do not assume that arbitrary public or private list contents can be read through an API. If a link cannot be imported, explain and accept individual place links or names as a fallback. Private lists require an explicit access approach before support is promised.

**Exit evidence:** a supported list link yields recognizable, deduplicated venues with source attribution; inaccessible lists fail clearly, and venue matches do not book the wrong restaurant.

### L3 — Ticketmaster, OpenTable, and other providers

Introduce each provider separately behind discovery and booking adapters:

| Integration | Initial goal | Separate follow-on gate |
| --- | --- | --- |
| Ticketmaster | Discover relevant events and share current event/ticket links | In-chat ticket purchase only if supported access, inventory, payment, and authorization are established |
| OpenTable | Find venues and available reservation paths | Direct reservation execution only after supported access and a complete booking flow are validated |
| Other reservation providers | Expand restaurant or activity coverage based on group demand | Validate authentication, live inventory, booking confirmation, and management for each provider |

For every provider, distinguish discovery, availability lookup, link handoff, direct booking, and cancellation. Access to one capability does not establish access to the others. Reuse the same owner authorization and duplicate-booking protections, and preserve provider-specific terms.

**Exit evidence:** each released capability works end to end against its provider and is labeled accurately in chat; handoffs never appear as completed bookings.

### L4 — Broader rollout and ongoing assistance

Add multiple groups, self-service private account connection, multiple booking owners, verified mixed-device transport support, optional calendar sync, recurring hangouts, and richer preferences as demand warrants. Scale storage, workers, monitoring, and account lifecycle management based on pilot evidence.

**Exit evidence:** independent groups and owners can use Ara without sharing private state or credentials, with documented transport support and reliable recovery paths.

## Implementation decisions to resolve first

- Sendblue account/number provisioning and the exact group-join behavior available to the pilot.
- Resy authentication and booking access suitable for the designated owner.
- Hosted environment for webhooks, persistent state, and background processing.
- Which existing discovery/reservation modules are reusable without carrying the legacy web flow into V1.

These are implementation prerequisites to investigate, not reasons to expand the release scope. Record decisions and milestone evidence here as work completes; do not mark integration work complete based on documentation changes alone.
