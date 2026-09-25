# Ara: restaurant booking competitive analysis

> Historical reference. [README.md](../../README.md) is the current PRD; [EXECUTION_PLAN.md](../../EXECUTION_PLAN.md) defines the current milestones. Conflicting scope and release gates below are superseded.

Research date: 2026-09-15
Status: decision support; desk research, not hands-on competitor testing
Companion: [MVP validation and staged rollout](MVP_ROLLOUT_PLAN.md)

## 1. Recommendation

Start by making Ara excellent at turning a group's availability and preferences into a decision and a trustworthy booking handoff. Validate that outcome before investing in scarce-table automation. Conversational discovery alone is a weak differentiator; reliable group coordination is a more specific product hypothesis to test.

Treat discovery, live availability, alerts, waitlists, reservation creation and cancellation as separate capabilities. Ship each only when its access rights, reliability and operating costs are established. A restaurant URL, an API response, a waitlist entry and a confirmed reservation represent different promises.

This document separates:

- **Published product behavior:** what the operator says its product does; not independently validated success rates.
- **Documented implementation/access:** official API documentation or an explicitly identified public code example.
- **Inference/recommendation:** our interpretation and proposed Ara design, not a claim about a competitor's private system.

No competitor's internal model, hosting, database, contractual rights or unit economics is assumed unless disclosed. “Not found” below means not found in the reviewed sources, not proof that something does not exist. Availability and pricing can change; recheck before committing to an integration.

## 2. Product landscape

| Service | Customer and job | User journey and completion | Public implementation evidence | Implication for Ara |
|---|---|---|---|---|
| Quenelle | Diners seeking a text concierge | Message a request; receive recommendations, monitoring or supported automatic booking | Detailed operator documentation; no public source implementation identified | Closest concierge benchmark; see limitations below |
| TableOne | Diners hunting an opening | Set restaurant/date/time/party criteria; receive an alert; book on the official platform | Public workflow guide; polling architecture and access agreements not disclosed | Alerts can deliver value without taking booking authority |
| Resy Notify | Existing Resy diners | Request notification for a restaurant/date; act on an opening | Official product explanation | Single-platform alerts are already an incumbent feature |
| Resy in ChatGPT | Diners using a general assistant | Discover a US restaurant, select a time, supply details and confirm with Resy inside ChatGPT | Official partnership announcement | Natural-language reservation UX is becoming a distribution feature |
| Dorsia Book On Behalf | Concierges and their guests | Concierge selects inventory; guest receives a link and completes payment | Public concierge instructions and restaurant operating guides | Supply relationships and payment completion are separate from conversation quality |
| Slang AI | Restaurants handling incoming calls | Caller requests a table; agent checks inventory, books and confirms | Announced OpenTable partnership and public integration description | Restaurant-authorized automation follows a different sales/access model |
| ResX | Holders and seekers of existing reservations | Community members release and claim reservations | Published exchange rules | An adjacent supply model, not evidence of an AI booking engine |
| Linq Resy Agent | Developers exploring messaging agents | iMessage conversation invokes search, availability and reservation tools | Public MIT-licensed repository and architecture README | Useful implementation reference; not proof of production readiness or platform authorization |

Sources and qualifications for each row are in the following sections. These are different business models, not interchangeable implementations of the same product.

## 3. Quenelle: closest concierge comparison

### Product proposition

Quenelle markets an iMessage/SMS concierge with persistent preferences and a $15/month subscription with a seven-day trial. Its homepage presents broad platform and city coverage. The subscription sells ongoing assistance rather than a fee for each successful booking. These are advertised terms, not independently tested service levels. [Quenelle homepage](https://www.quenelle.ai/)

### What its detailed documentation actually discloses

Its docs distinguish polling watches, standing-authority Auto-Book, and jobs timed to inventory releases. Auto-Book supports connected Resy/OpenTable accounts; OpenTable release snipes are live and Resy snipes paused. Tock supports waitlist registration only, not availability search. The docs describe an NYC focus, narrower than the homepage's city positioning.

Operational disclosures include dedicated monitoring, demand-weighted polling, duplicate-alert suppression and preserving state on provider errors. Account connection uses verification codes. Financial controls include a quoted charge ceiling, checking live terms and requesting approval when risk changes. Hit Lists preserve a set of restaurants for repeated searches.

The docs acknowledge potential conflict with booking-platform terms. Their statement about unavailable OpenTable policies describes their automated access path; it does not establish that official partner APIs lack policy data. These are operator disclosures, not audited implementation evidence. [Quenelle documentation](https://www.quenelle.ai/docs)

### Interpretation for Ara

The interesting engineering problem is persistent intent: a request remains useful after the chat turn ends. That calls for durable jobs, explicit expiry, controllable permissions and an accurate request history. The LLM is only one part of that system.

Do not infer that Quenelle offers Ara a reusable API, has a particular LLM vendor, or has sanctioned access to every provider. No such evidence was established here. Its monitoring cadence is also not a recommendation for our own polling limits.

For group planning, add a constraint a personal concierge can avoid: an organizer changing party size, date or venue after voting must invalidate the previous group's booking authorization. That is a proposed Ara requirement, not an observed Quenelle feature.

## 4. Other approaches worth learning from

### TableOne and Resy Notify: alert, then hand off

TableOne describes monitoring accepted dates, time windows and party sizes across releases and cancellations. Users complete the reservation on the restaurant's official platform. It explicitly says alerts neither hold a table nor guarantee availability, and that it does not transfer or mark up reservations. Its public guide does not reveal provider authorization, endpoint contracts, polling infrastructure or an API for other developers. [TableOne booking guide](https://tableone.app/guides/how-to-get-hard-to-get-restaurant-reservations)

Resy Notify similarly alerts diners when a requested opening appears; the diner must claim it and a notification is not a reservation guarantee. [Resy Notify explanation](https://blog.resy.com/2021/09/notify/)

**Recommendation:** a clear “opening detected; finish booking here” flow is a legitimate product tier. Measure successful handoffs and independently confirmed reservations separately. Do not count alert delivery or a link click as a booking.

### Resy in ChatGPT: incumbent distribution

Resy announced on August 10, 2026 that diners can discover and book its US restaurants inside ChatGPT, selecting a time, providing details and confirming with Resy. The announcement establishes that integration, not an equivalent self-service developer API for Ara. [Resy announcement](https://blog.resy.com/newsroom/resy-launches-reservations-in-chatgpt/)

**Inference:** competing solely on “ask an AI to find dinner” is increasingly exposed to incumbent distribution. Test whether handling everyone's calendars, attendance and decision deadlines produces value that persists even when individuals can book through a general assistant.

### Dorsia: concierge workflow backed by supply relationships

Book On Behalf provides approved concierge users a search-and-select workflow. The guest receives an SMS link, enters payment details and confirms. Its instructions describe a 30-minute hold and explicit sent, confirmed, expired and canceled states. This is a supported product workflow, not a public booking endpoint specification. [Dorsia concierge guide](https://www.dorsia.com/dorsia-bookonbehalf-getting-started)

Dorsia's restaurant materials describe minimum-spend prepayments and custom requests that restaurants can accept or deny. The economic exchange includes restaurant commitments and guest spending, rather than just faster access to another marketplace's cancellations. [Dorsia restaurant payment guide](https://www.dorsia.com/playbooks/dorsia-pay-lite)

**Recommendation:** borrow the clarity of pending versus confirmed and the separation between an organizer initiating a request and a payer accepting terms. Direct restaurant partnerships might eventually provide reliable supply, but require restaurant acquisition and service operations; treat that as a distinct business investment.

### Slang AI: the restaurant authorizes the agent

Slang's OpenTable integration describes a caller making a request, the system checking availability, and voice/text confirmation with the reservation written into OpenTable. Booking, modification and cancellation are supported through its advertised partnership. The published material is integration evidence, not reusable source code or developer credentials. [Slang integration](https://www.slang.ai/opentable)

A June 2026 update distinguishes checking public online availability from creating the reservation in the restaurant's in-house inventory. This is a useful example of why apparently identical booking flows may have different inventory permissions. [Slang product update](https://www.slang.ai/product-updates/june-2026)

**Inference:** serving restaurants can produce a clearer authorization relationship, but changes buyer, onboarding, support and distribution. Ara should not assume a restaurant-side integration license permits a consumer aggregator to search or book across unrelated restaurants.

### ResX: community exchange

ResX describes connecting people releasing existing reservations with people seeking them. Its terms disallow profitable resale and state that the service does not use bots or scraping to make reservations. This belongs in the competitive set because it addresses scarce-table demand, but it is not an implementation precedent for an autonomous reservation agent. [ResX terms](https://www.resx.co/terms-of-use)

**Recommendation:** exclude reservation exchange from the initial roadmap. It introduces transfer validity, identity, fees and dispute handling without directly validating Ara's group-coordination hypothesis.

## 5. What developers can actually access

Publicly readable documentation is not the same as open commercial access. The table records what the reviewed sources establish; obtain written confirmation of permitted use before depending on a partner integration.

| Platform | Public evidence and access boundary | What this means for Ara |
|---|---|---|
| OpenTable | Public API reference; approved partnership and production agreement required. Documents availability and Consumer Booking API v2, OAuth bearer authentication, cancellation-policy information and mutation request IDs for idempotency. Sandbox responses are curated rather than live reservations. | Best first partnership feasibility inquiry. Confirm consumer/affiliate scope, eligible venues, pricing, quotas, data retention and production approval; sandbox success is not live inventory validation. [Official docs](https://docs.opentable.com/) |
| Resy | Public consumer products, a concierge program and selected partnerships exist. The reviewed official material did not establish a general self-service booking API for Ara. | Ask about a supported commercial path; an endpoint used by the website or an unofficial client is not evidence of permission. Concierge website access is not programmatic access. [Concierge FAQ](https://helpdesk.resy.com/concierge-faqs-ByCAvm8O) |
| SevenRooms | API documentation access is individually provisioned; new API users are directed to apply through partnerships. | Determine restaurant authorization requirements and consumer aggregation eligibility before designing against assumed endpoints. [API portal](https://api-docs.sevenrooms.com/) |
| Tock | Official FAQ describes Premium-plan API/webhook access, historical exports and guest-profile ingestion. It explicitly excludes available-inventory queries and creating/canceling reservations through these APIs. | Useful data integrations do not supply a booking engine. Treat ordinary handoff or a separately negotiated channel as different work. [API FAQ](https://tock.zendesk.com/hc/en-us/articles/25447494175508-API-FAQ) |

Do not advertise universal restaurant availability based on one approved provider. Model capability at provider, account and venue level. Confirm geography, deposits/experiences, cancellation, rate limits and webhook coverage individually.

### A concrete public implementation: Linq Resy Agent

The repository README documents an iMessage → Linq webhook → Claude tool-use loop, with tools for restaurant search, slots, booking, cancellation and upcoming reservations. It describes per-user encrypted credentials and an OTP connection flow; its development mode can instead share an environment-configured account. The documented layout uses in-memory user/conversation stores. The repository is MIT-licensed. These statements are based on its README, not a code audit or execution. [Linq Resy Agent](https://github.com/linq-team/linq-resy-agent)

**Use:** study the boundary between conversation, identity and deterministic tools. **Do not infer:** uptime, durable recovery, sufficient payment authorization, safe multi-user deployment, or Resy permission. The code license does not grant rights to use a reservation platform. No relationship between this project and Quenelle was established.

## 6. Proposed Ara implementation approach

The following is our design recommendation, not a reconstruction of competitors' private architectures.

### Keep the LLM outside the transaction boundary

1. The model interprets intent and proposes structured constraints.
2. Application code validates exact venue identity, date, timezone, party size and supported capabilities.
3. A provider adapter returns typed results with provenance and observation time.
4. The UI shows the actual offer and applicable terms.
5. A deterministic service checks current authorization, revalidates the offer and performs a permitted mutation.
6. A reconciliation process obtains provider confirmation before reporting success.

Store provider identifiers and offers as trusted records; do not let generated text invent a URL, confirmation number or bookable time. Persist requests, attempts and outcomes separately from chat history.

### Explicit state and permissions

| Object | Proposed states or fields | Rule |
|---|---|---|
| Availability observation | not_checked, available, unavailable, unsupported, provider_error; observed_at and expires_at | Errors and unsupported access never become “no tables” |
| Booking request | draft, awaiting_authorization, ready, submitting, confirmed, failed, outcome_unknown, canceled | A timeout after submission stays unknown until reconciled |
| Authorization | actor, plan_version, exact venue or approved set, party, time range, fee ceiling, terms, expiry | Material changes require renewed approval |
| Provider adapter | search, availability, watch, waitlist, book, modify, cancel capability flags | Unsupported actions remain unavailable in UI and model tools |

One plan can consider many venues but should have one active booking commitment unless the organizer explicitly approves otherwise. Enforce this in storage and workers. Provider idempotency and an internal unique request key complement each other; a retry must not create a second reservation.

### Build the simplest supported integration first

- **Handoff:** accurate venue links and organizer confirmation; no provider credentials stored.
- **Live availability:** one authorized source, exact matching, freshness and outage handling.
- **Monitoring:** durable queue, deduplicated work by venue/date/party, provider-approved polling budgets, request expiry and notification deduplication.
- **Booking:** one supported provider, explicit per-booking approval, reconciliation and cancellation handling.
- **Standing authority:** only after ordinary booking is reliable; revocable, narrow, time-limited permissions and enforceable financial bounds.

Use hosted provider payment flows where available. Keep raw cards, authentication codes and booking tokens out of prompts, analytics and logs. This limits the sensitive data Ara needs to handle while making account disconnect and revocation testable.

## 7. Implications for the current repository

The current reservation code supports lookups and outbound links, not an end-to-end booking transaction. Inspection for this analysis confirmed two specific trust gaps:

- [Reservation aggregation](src/lib/reservations/index.ts) inserts “Check OpenTable for times” into the available-times list when there is no inventory result. Replace this with a distinct unchecked/handoff state before external testing.
- [Venue matching](src/lib/reservations/match-venue.ts) searches Resy with fixed NYC coordinates and a loose name match, while constructing OpenTable links with a fixed party size and generation-time date. Use verified venue identities and the actual plan constraints; unresolved matches should remain unresolved.

These are more urgent than choosing a more capable model. They directly affect whether the product can be trusted. This analysis does not modify the application or establish that live integrations currently work.

| Stage, aligned to rollout plan | Capability to validate | Additional booking-specific gate |
|---|---|---|
| Local MVP | Honest results and reliable handoff | No placeholder presented as availability; tested exact-city/date/party links; no unsupported booking claims |
| Friends alpha | Group chooses an outing and organizer completes booking | Record clicked, self-reported booked and actually attended separately; investigate failed handoffs |
| Invitation beta | One supported live availability integration, if justified | Confirm access rights and costs; freshness/outage tests; measure venue-match accuracy on a fixed evaluation set |
| Public launch | Reliable supported promise at bounded demand | Kill switch, quotas, support ownership and provider-change response; launch need not include auto-booking |
| Later booking pilot | Explicitly approved reservation creation | Zero duplicate/unauthorized bookings in acceptance tests; cover lost responses, retries, changed terms, cancellation and revoked credentials |
| Later expansion | Monitoring, standing authority or another provider | Independent evidence that the previous capability improves completed group plans at sustainable cost |

The companion rollout plan remains the release checklist. These are additional decision criteria, not claims that any gate has passed.

## 8. Risks, checks and decisions

| Risk or pivotal choice | Check / mitigation | Decision needed |
|---|---|---|
| Provider access disappears | Secure a supported access path; capability flags, adapter isolation and immediate handoff fallback | Which provider can authorize our actual consumer use case? |
| Ambiguous restaurant identity | Stable IDs, city/address checks, reviewed evaluation cases; refuse near ties | Curated launch catalog versus broad search |
| Stale inventory or unclear transaction result | Recheck before commit; persist attempt IDs; reconcile unknown results before retrying | Maximum freshness and who handles unresolved bookings |
| Group changes after consent | Bind approval to a versioned plan; invalidate on material changes | Who can commit and who pays? |
| Deposits/cancellation obligations | Show exact offer and terms; require explicit acceptance; provider-hosted payment | Initially exclude prepaid/nonrefundable experiences? Recommended yes |
| Monitoring becomes expensive | Track provider calls, queue time, notifications, model cost and support minutes per completed plan | Paid monitoring only if cohort economics support it |
| Incumbents absorb conversational discovery | Compare retention and organizer effort against ordinary group chats plus booking apps | Is coordination valuable without scarce-table access? |
| Restaurant partnerships distract from MVP | Pilot with a tiny willing restaurant cohort only after demand evidence | Consumer coordination business or restaurant operations business? |
| Public competitor claims overstate reality | Hands-on tests, dated evidence and explicit unknowns | Which capabilities actually affect users' choice? |

## 9. Next research and product experiments

1. **Interview five organizers.** Ask about their last completed and abandoned restaurant outing. Separate scheduling, deciding, availability and payment pain. Avoid assuming everyone wants hard-to-get tables.
2. **Run a manual comparison.** Use the same city, party and time constraints in Ara's handoff flow and selected competitors. Record supported coverage, onboarding effort, latency and correctly completed outcomes. Do not create speculative duplicate reservations; real bookings require an intended meal and accepted terms.
3. **Contact providers about feasibility.** Prepare a one-page consumer use case and ask about availability, booking/cancel permissions, account connection, geographical coverage, pricing, quotas and approval timelines. This document does not initiate outreach.
4. **Choose the next tier from evidence.** If groups cannot agree, fix coordination. If agreed plans fail at inventory search, add authorized availability. If valid openings disappear before users act, evaluate monitoring or booking with measured demand.
5. **Track economics honestly.** Cost per completed plan = allocated infrastructure + provider charges + messaging + model usage + support cost, divided by completed plans. Also report abandoned-plan cost and monitoring cost per active request-day. No competitor margin can be inferred from advertised pricing.

Suggested owner: Jack for product experiments and provider discussions; assigned engineering owner for adapter feasibility and failure tests. Review this analysis before each rollout gate and whenever a provider changes access or a major competitor changes booking behavior.
