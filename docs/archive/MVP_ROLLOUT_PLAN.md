# Ara: MVP validation and staged rollout

> Historical reference. [README.md](../../README.md) is the current PRD; [EXECUTION_PLAN.md](../../EXECUTION_PLAN.md) defines the current milestones. Conflicting scope and release gates below are superseded.

Last reviewed: 2026-09-07
Status: proposed plan; local integration checks passed, Gate 0 NOT passed
Accountable product/release owner: Jack
Engineering owner: named implementer for each work package; Jack until assigned

## 1. Outcome and release principles

Help an existing group of friends agree on a feasible time and activity with less organizer effort than a group chat. Start with one city, groups of 3–6, and casual meals/general hangouts. These are proposed constraints, not validated customer requirements.

Success means a group makes a decision and ultimately meets up. Generated options, votes and booking-link clicks are intermediate events. Roll out through local testing → controlled friends alpha → invitation beta → public launch, then expand capabilities independently.

All numerical gates below are proposed operating targets, not forecasts or industry benchmarks. Confirm them before recruiting each cohort. Do not relax thresholds after seeing results just to ship. Passing a gate permits the next capped cohort, not unlimited growth. Small alpha samples provide directional evidence, not statistical proof of product-market fit.

Hard blockers: unauthorized data access, secret exposure, fabricated availability, silent loss of committed votes, or an unresolved severe defect in the supported journey. Other exceptions require an owner, mitigation, expiry and written decision.

## 2. Current baseline

| Area | Implemented or verified locally | Not yet established |
|---|---|---|
| Core journey | Create, share, join, preferences, generate and vote implemented | Independent-account E2E and real group outcome |
| Google | Sign-in, encrypted refresh token, refresh and real free/busy request succeeded | Hosted callbacks, denied/revoked permissions, multiple participants |
| LLM | Small gpt-4o-mini request succeeded; native fetch resolved connection issue | Real suggestion quality; response-field mapping still broken |
| Checks | Latest type check, lint and five availability tests passed | Final release build and broader regression coverage |
| Discovery | Yelp/Ticketmaster adapters and fictional fallbacks exist | Live source configuration and accuracy; Eventbrite search replacement |
| Reservations | Resy lookup code and outbound links exist | Live inventory accuracy; automatic booking absent |
| Persistence | Local SQLite and startup schema creation | Hosted persistence, migrations, concurrency and restore |
| Operations | Local app running; reviewed fixes remain uncommitted | CI, hosted service, monitoring, release/rollback process |
| Dependencies | Last audit reported seven findings | Re-audit and assess runtime exposure at release |

Code references: [scheduling](src/lib/availability.ts), [pipeline](src/lib/plans/service.ts), [LLM adapter](src/lib/ai/suggest.ts), [results/votes](src/lib/plans/results.ts), [join API](src/app/api/join/[token]/route.ts), [Calendar](src/lib/google/calendar.ts), [reservations](src/lib/reservations/index.ts), [database](src/lib/db/index.ts), [token encryption](src/lib/crypto/tokens.ts).

An API connectivity test does not establish that the complete suggestion pipeline works. A successful fallback must not hide a broken integration in release evidence.

## 3. M0 — Trustworthy local MVP

**Question:** Can independent identities complete the supported journey with correct times, honest options and private data?

### Required work before Gate 0

- [ ] Validate LLM output at runtime and map slot_index, book_url and event_url correctly. Reject out-of-range indices; never silently map an invalid activity to slot zero. Derive displayed URLs, venues and times from trusted input records.
- [ ] Validate date order, duration and IANA timezone. Interpret date-only inputs in the plan timezone, make the UI end date inclusive, and convert to an exclusive boundary internally. Store UTC instants; display the plan timezone explicitly.
- [ ] Apply user-selected local social hours, full event duration and travel buffers. An empty calendar must not produce midnight suggestions by default.
- [ ] Treat missing/error Calendar responses as unknown, never free. Offer reconnection or an explicit organizer exclusion with visible coverage. Recompute after membership/date changes and enforce a documented freshness limit.
- [ ] Disable fictional discovery outside clearly labeled demo mode. Return honest time-only/general options or organizer-provided venues when sources fail. Remove the discontinued Eventbrite search path from the supported flow until replaced.
- [ ] Separate not-checked, available-as-of, unavailable and provider-error states. OpenTable's current “Check OpenTable for times” placeholder must not count as inventory. Fix venue/city matching and party/date/time links; disable unverified Resy checks by default.
- [ ] Version generated results and attach votes to that version. Publish results atomically, enforce one active generation per plan, and warn before reopening voting. Replace retry-sensitive vote toggles with idempotent set/unset operations.
- [ ] Audit all current and legacy API authorization. The unauthenticated join GET currently exposes participant preferences: restrict the public preview and document who can see notes. Add invite expiry/revocation.
- [ ] Enforce initial server-side bounds: at most 8 participants, a 30-day range, 3 displayed options, plus per-user/per-plan generation limits and an application spend cap.
- [ ] Remove Gmail scope and disable legacy sending routes for the link-based alpha. Evaluate a narrower free/busy scope. Disclose that only the primary calendar is checked until calendar selection is implemented.
- [ ] Fail hosted startup on missing secrets; remove the development encryption-key fallback in hosted mode. Review runtime-reachable high dependency findings and fix or explicitly mitigate them before external testing.

### Gate 0: local → hosted alpha readiness

All alpha-mandatory cases in section 7 pass against one identified commit. Complete at least 10 scripted E2E runs using independent identities, including 5 real Calendar/provider checks; stubs do not count as live evidence. Zero hard blockers, clean build/type/lint/tests, and a recorded two-account walkthrough. Hosted prerequisites in M1 must also pass before inviting friends.

**If blocked:** narrow scope to accurate time coordination and curated venues. Do not compensate for unreliable scheduling with more sophisticated AI recommendations.

## 4. M1 — Hosted controlled friends alpha

**Cohort:** 3–5 existing groups, approximately 10–25 friends, one city. Plan for 2–3 weeks, extending until evidence is sufficient. Manual assistance is allowed but measured.

### Before first invite

- [ ] Review/commit local fixes and lockfile; deploy a specific GitHub commit. Add CI: npm ci, explicit TypeScript check, lint, tests and production build. CI uses synthetic fixtures and dummy build secrets, never production tokens. Standardize Node 22 initially, matching .nvmrc.
- [ ] Select hosting. Proposed alpha architecture: one Node service with persistent SQLite disk. Render paid service plus disk is an option, not an approved purchase. Verify restart/redeploy preserves plans and votes. A PostgreSQL URL alone cannot switch this SQLite implementation.
- [ ] Set the public app URL, separate hosted secrets and exact HTTPS OAuth callbacks. Keep local credentials separate. Add actual testers to Google Testing audience and an application-level alpha allowlist; Google configuration does not replace app authorization.
- [ ] Test consent denial, revocation and reconnection. Google's external Testing mode issues seven-day refresh tokens for these scopes. [Google token lifecycle](https://developers.google.com/identity/protocols/oauth2).
- [ ] Use fresh hosted credentials; rotate any secret previously shared in conversation before production use. Keep .env, OAuth JSON, tokens, database dumps and identifying evidence out of Git. Enable secret scanning.
- [ ] Publish accurate privacy copy covering derived times/preferences sent to the LLM, scope coverage and note visibility. Provide support and manual disconnect/deletion processes.
- [ ] Add request IDs, redacted errors, provider health, generation mode/status, latency/cost counters, quota alerts and switches for signups, generation, LLM and discovery. Viewing/voting should survive provider outages.
- [ ] Back up SQLite using an online, WAL-consistent backup mechanism to a separate protected location. Restore in isolation and verify plans/votes. Initial target: at most 24 hours of lost data and recovery within 4 hours. A disk snapshot is not evidence of a valid database backup. [Render disk constraints](https://render.com/docs/disks).
- [ ] Rehearse application rollback. Do not assume code rollback reverses database migrations. Record release commit, migration version and restore procedure.

### Alpha experiment

Jack observes each group's first attempt, then lets the group plan independently. Record organizer effort and follow-up messages for a comparable recent group-chat plan. After each attempt, interview the organizer for five minutes and survey participants briefly. Include abandoned plans. Record the selected option and whether the meetup happened manually until the product supports confirmation.

### Gate 1: friends alpha → invitation beta

At least 10 eligible plans across 3 independent groups:

- At least 7 select a feasible option within 48 hours; at least 3 meetups reported completed.
- At least 80% of valid invite viewers complete joining without developer intervention.
- At least 70% of responding organizers report less effort than their usual method; show response count and nonresponses.
- At least 95% of accepted generation attempts resolve correctly within 60 seconds, including correctly explained no-overlap outcomes.
- No hard-blocker incident; severe issues fixed and regression-tested. Restore and rollback evidence complete.

**Failure response:** hold cohort size. Consent drop-off prioritizes manual availability; voting without decisions prioritizes confirmation/deadlines; poor venue trust prioritizes curated sources. Recruit additional groups only after the relevant fix is tested.

## 5. M2 — Invitation beta

**Cohort:** expand in batches toward 50–100 active testers / 10–20 groups, including people outside Jack's immediate circle. Observe at least four weeks and 30 eligible plans. Stay within OAuth/provider audience limits; complete required publishing/verification before exceeding them.

### Beta scope

- Durable organizer-selected outcome, cancellation and rescheduling. Proposed states: collecting → generating → voting → confirmed → completed/cancelled. Confirmed means a selected hangout, not a reservation. Reopening creates a new version.
- Manual availability if alpha identifies calendar consent/coverage as a blocker. Natural-language availability is a draft requiring user confirmation of dates, times and timezone.
- Self-service disconnect, leave-plan and deletion with explicit shared-record semantics and retention. Upgrade token storage to authenticated encryption and versioned keys before broader beta.
- Versioned database migrations in Git. Current .gitignore excludes drizzle/*.sql; resolve that before relying on generated migrations. Trial migrations against representative data and verify recovery.
- Durable generation jobs when latency/recovery triggers in section 10 are met; persist progress, idempotency and bounded retries.
- One reliable discovery source per supported area with stable IDs and source timestamps; no automatic city expansion.
- At least 50 reproducible evaluation cases: malformed output, conflicting preferences, no overlap, wrong-city venues, stale inventory and prompt injection. Compare prompt/model candidates on identical fixtures.
- Hosted staging with separate database/credentials, a measurable funnel and controlled release flags.

### Gate 2: beta → public-launch candidate

- At least 75% of eligible plans choose a feasible outcome within 48 hours.
- At least 40% of organizers with a full 28-day follow-up create a second eligible plan.
- At least 80% of surveyed organizers rate value 4/5 or higher, with sample and nonresponse reported.
- At least 98% correct generation resolution; p95 ≤30 seconds at supported group size.
- At least 95% of evaluated options pass the full feasibility/relevance rubric, and 100% pass machine-checkable constraints such as time boundaries, membership coverage and trusted IDs.
- Fewer than 10% of plans need staff assistance. Cost gate passes. No unresolved S0/S1 incident for 14 days.

If engagement improves but meetup outcomes do not, iterate the decision flow before adding integrations. Do not average away a failing city, device or cohort.

## 6. M3 — Public launch and controlled growth

Before launch: Gate 2 passes, accurate public onboarding/privacy/support exist, required OAuth verification is complete, on-call/release ownership is assigned, abuse controls and application spend caps are enforced, and no unmitigated runtime-reachable high vulnerability remains. Publish only supported capabilities and locations.

Start with capped admission: 100 → 250 → 500 active users, reviewed weekly before each expansion. These are proposed admission limits, not claims of infrastructure capacity. Use a waitlist when support, quotas or reliability limit growth.

**Gate 3 operating evidence:**

- Core-route availability target 99.5% over a 28-day beta window, measured by synthetic checks including deployment downtime.
- At least 98% correct generation resolution; p95 ≤30 seconds; ordinary authenticated API p95 ≤1 second excluding external work; no acknowledged vote loss.
- A 30-minute test at 2× forecast peak, initially at least 20 simultaneous generation jobs and 50 concurrent browsing/voting sessions using provider stubs. Separately validate quotas with a small approved live sample. Stub load tests do not establish provider capacity.
- Demonstrated maximum one-hour data loss and recovery within two hours. Select database/backup architecture to meet this, not just an uptime marketing claim.
- Alerts, restore, rollback, provider-disable and support-response drills pass; beta completion and repeat-use targets remain healthy.

Do not add monetization until cost, repeat use and willingness-to-pay interviews justify a pricing experiment. Broad public launch and autonomous booking are separate decisions.

## 7. MVP test matrix and execution protocol

Use independent Google accounts and isolated sessions plus an outsider identity. Same-account tabs cannot validate authorization. Use synthetic calendar fixtures and clearly labeled test plans; never edit real events without permission. Exclude seeded runs from product metrics.

| ID | Scenario and expected result | Method / deadline |
|---|---|---|
| T01 | Create → join → generate → vote; same link changes state; votes survive refresh/restart | Browser E2E, local and hosted alpha |
| T02 | Denied grant, expiry, revocation and missing calendar provide recovery; unknown never becomes free | Adapter fixtures + live reconnect, alpha |
| T03 | Busy overlap, all-day/recurring events, exact boundaries and no overlap are correct | Unit/property + real Calendar fixture, alpha |
| T04 | Cross-timezone, DST, midnight, inclusive last date, reversed dates and social hours agree across UI/server | Deterministic unit + browser, alpha |
| T05 | Primary-calendar limitation visible; organizer counted once; late joins follow stated policy | Integration + UX, alpha |
| T06 | Duplicate join/generate, concurrent votes, rapid retries and stale result versions preserve data | DB integration/concurrency, alpha |
| T07 | Provider timeout/429/5xx, credit exhaustion, missing keys, malformed JSON and empty discovery show honest recovery | Fault injection, alpha |
| T08 | Injected notes, invented URLs/venues/times and invalid slot indices cannot become trusted facts | LLM fixtures + validator, alpha |
| T09 | Outsider/unauthenticated identity cannot read notes or invoke organizer actions; revoke/expiry works | API authorization matrix including legacy routes, alpha |
| T10 | Correct booking-link venue/date/party/timezone; unchecked inventory never called available | Contract tests + link review, alpha |
| T11 | Regeneration during voting, no participants and closed joins have explicit states; no silent vote reset | Browser E2E, alpha |
| T12 | iPhone Safari, Android Chrome, desktop; chat-to-OAuth return, keyboard access, loading/errors, readable layouts | Device/accessibility review, alpha and beta |
| T13 | Restart/redeploy, failed migration, backup restore and rollback meet documented guarantees | Staging operational drills, alpha |
| T14 | Disconnect/delete handles tokens and shared records; telemetry excludes secrets/raw notes | Integration + log inspection, beta |
| T15 | Confirm, cancel, reschedule and repeat planning need no staff; optional reminders never duplicate | E2E, beta as features land |

For every run record commit, environment, synthetic/live mode, timestamp, test ID, expected/actual outcome and sanitized evidence. File defects with severity and reproduction. PR checks use stubs; live checks use provisioned test accounts separately. Re-run affected regressions after fixes, then the release smoke suite. Never mark future cases passed based on code inspection alone.

## 8. Metrics, cost and evidence

- **Eligible plan:** non-test plan with organizer plus at least two others joined, supported city/date range and a full 48-hour decision window before its event. Report all earlier create/join abandonment separately, so eligibility does not hide funnel failure.
- **Join conversion:** unique valid invite viewers who join / unique valid invite viewers. Separate intentional decline, OAuth error and unknown outcome. Avoid invasive tracking.
- **Decision completion:** eligible plans with a selected feasible option within 48 hours / eligible plans observed for 48 hours. Keep no-overlap plans in this primary denominator and report them separately too.
- **Meetup completion:** reported completed meetups / confirmed plans whose event date has passed. Show nonresponse separately.
- **Repeat use:** organizers initiating another eligible plan within 28 days / organizers with a full 28-day observation window. Separate reminders/incentives/staff-created plans.
- **Correct generation resolution:** accepted attempts returning valid options or a correct no-overlap result / accepted attempts. Provider failures and degraded partial-calendar coverage are not successes. Record LLM versus deterministic mode.
- **Cost:** provider + LLM cost per attempt, per eligible plan including retries, and per confirmed plan. Track hosting separately. Initial proposal: $25/month variable API budget, ≤$0.25 average per attempt and ≤$1 per confirmed plan. Jack approves actual limits before alpha. Enforce daily/per-user caps in the app; billing alerts alone are not a hard cap.

Events to add: plan_created, invite_opened, join_completed, calendar_connection_failed, generation_started/completed/failed, option_voted, plan_confirmed/cancelled and meetup_reported. Keep pseudonymous IDs, result version, timestamps, provider outcome, model/prompt version, latency and cost. Exclude OAuth codes/tokens, email addresses, raw Calendar data and free-text notes from logs. Record only the data needed to answer the product question.

Review the funnel, failure counts, p95 latency and cost weekly. Interview abandoned-plan organizers as well as happy users. Display counts beside percentages. Compare organizer effort with similar group-chat planning experiences without claiming causality from a small uncontrolled sample.

## 9. Risk register and stop rules

| Risk | Check / trigger | Mitigation / owner |
|---|---|---|
| Incorrect availability | Busy overlap, stale membership or unknown coverage presented as verified | Block release; deterministic constraints and visible coverage. Engineering |
| Fictional venue/false table claim | No source ID; placeholder counted as inventory | Demo/live separation, provenance and provider switches. Engineering + product |
| Consent friction | >20% invite drop-off attributable to Calendar | Explain scope, test narrower grant and manual entry. Product |
| Private note leakage | Outsider or public preview exposes preferences | Role-based reads, minimal preview, revocation and negative tests. Engineering |
| Credential exposure | Secret scan, unsafe logging or exported database | Redact, rotate/revoke, fresh hosted keys, authenticated encryption. Engineering |
| Vote/result corruption | Duplicate submits, stale options, dropped votes | Versioning, transactions, constraints and idempotency. Engineering |
| LLM cost/latency or injection | Budget violation, invalid output or untrusted action | Bound calls, trusted IDs, runtime validation and deterministic fallback. Engineering |
| Provider/dependency instability | Rate limits, revoked key or reachable high advisory | Adapter tests, exposure assessment and capability switches. Engineering |
| Database bottleneck/loss | Lock errors, replica need or failed restore target | Short transactions, WAL-aware backups; migrate before replicas. Engineering |
| Votes do not lead to meetups | Good engagement but poor decision/completion | Confirmation, deadlines and organizer UX first. Product |
| Support overwhelms team | >10% assisted plans or incident backlog | Freeze invites, reduce scope and fix root causes. Release owner |
| Duplicate/unauthorized booking | Ambiguous provider response, fees or retries | Keep external links until booking gate passes; never blind-retry. Engineering + product |

S0: security/privacy breach, unauthorized booking/payment or irreversible data loss. S1: widespread broken core journey or false verified availability. S2: isolated recoverable failure. S3: cosmetic/friction.

Any S0/S1 pauses expansion immediately. Disable affected capability, preserve sanitized evidence, inform affected testers when needed, and resume only after tested remediation and owner review. Generation failures >5% for 15 minutes with at least 20 attempts trigger disabling generation/new admissions while retaining read/vote access. At low volume, inspect every failure manually rather than relying on percentages.

## 10. Pivotal technical and design decisions

Record decisions in docs/decisions/ with context, alternatives, choice, owner, consequences and revisit trigger. Defaults below are recommendations, not implemented commitments.

| Decision | Proposed default | Deadline / revisit trigger |
|---|---|---|
| Product promise | One-city coordination and outbound booking links | Before alpha; revisit with repeat-use demand |
| Calendar access | Free/busy only; primary calendar disclosed; assess narrower scope and manual alternative | Before alpha. [Google supported scopes](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query) |
| Voting/decision | Multiple approvals; organizer resolves tie and confirms; reopening versions results | Policy before alpha; confirmation before beta |
| Late joins | Freeze membership per generation; explicit reopen to include new people | Before alpha; no mutual claim for excluded users |
| LLM authority | Rank/explain trusted candidates; code enforces feasibility; no action authority | Before alpha; model changes require eval/cost/latency evidence |
| Hosting/database | Single persistent SQLite service for alpha; managed PostgreSQL for replicas/workers or recovery needs | Hosting before alpha; migrate before multi-instance, >0.1% write lock failures/week, or failed 2× peak test |
| Generation execution | Single-flight bounded requests initially; durable jobs when needed | Switch when p95 >20 seconds, restart recovery needed or timeout risk demonstrated; decide before beta |
| Notifications | Group-chat link first; opt-in reminders if nonresponse blocks outcomes | After alpha evidence; require unsubscribe, rate limits and deduplication |
| Geography/sources | Prove each source/city independently | Expand only after coverage/link audit and quotas verified |
| Retention/deletion | Minimal derived data; short-lived availability cache; propose 90-day inactive-plan detail retention | Publish actual policy before alpha; validated user controls before beta |

### Capability expansion gates

1. **Lower joining friction:** manual availability, then natural-language entry. Gate: measured consent/coverage drop-off; user confirms parsed dates/times; timezone fixtures pass.
2. **Close the decision loop:** confirmation, reschedule and optional reminders. Gate: reliable voting plus demonstrated indecision; improve completion without notification complaints.
3. **Personalize recommendations:** structured diet/budget/distance and curated favorites. Gate: repeat-use signal and ≥50-case evaluation showing better relevance without hard-constraint violations. Never infer dietary safety from model confidence.
4. **Expand sources/cities:** stable venue IDs and full event-time matching. Gate: ≥95% correct venue/link/time audits across 50 sampled options per new area; source-use requirements and quotas checked.
5. **Assisted booking:** prepare verified provider checkout; user completes it. Gate: demonstrated demand, supported provider access, accurate party/date/time, inventory freshness and disclosed fees. Link clicks are not reservations.
6. **Agent-executed booking — separate milestone:** require provider-access/terms review, explicit per-booking approval and a constrained action service. Verify final price, fees and cancellation terms; use idempotency, audit events, provider confirmation ID, timeout reconciliation and cancellation/support paths. LLM output cannot itself prove success. Pass at least 100 provider-sandbox cases including duplicate submissions and ambiguous failures with zero unauthorized/duplicate bookings, then review every booking in a capped 10-booking consenting pilot. Deposits/payments require a separate readiness review. A model upgrade does not satisfy this gate.

## 11. Immediate work packages

1. Correctness PR: schema mapping/validation, timezone/full-duration constraints, unknown Calendar handling, real-data fallback and honest reservation claims; focused regressions.
2. State/privacy PR: result versions/transactions, idempotent votes, authorization, note privacy, revocable invites and request limits.
3. Alpha deployment PR: current fixes, CI, environment documentation, startup validation, hosted OAuth, persistent database, migrations, backup/rollback and redacted monitoring.
4. Gate 0 review: execute the matrix and record go/hold evidence before recruiting.
5. Friends alpha: approve spend/cohort, observe first attempts, interview and review weekly.
6. Beta decision: choose one capability investment based on alpha evidence and complete confirmation/operations prerequisites.

These are ordered packages, not date promises. Do not start native mobile apps, microservices, multi-city expansion or autonomous booking without a measured user problem or operating constraint.

## 12. Living release record and GitHub workflow

Keep this Markdown file in Git; link sanitized evidence through issues/PRs. Each implementation PR updates relevant status. Review weekly in alpha/beta and at every cohort boundary. Preserve decision history in Git. Never commit private tester lists or credentials.

| Gate | Current status | Commit/evidence | Owner/date | Blockers |
|---|---|---|---|---|
| G0 local → alpha readiness | NOT PASSED | Local component checks only | Jack / pending | Correctness, privacy, concurrency and E2E |
| G1 alpha → beta | NOT STARTED | — | Jack / pending | Hosted prerequisites and real cohort evidence |
| G2 beta → launch candidate | NOT STARTED | — | Jack / pending | Product, evaluation, cost and operational gates |
| G3 launch/expansion | NOT STARTED | — | Jack / pending | Launch review and capacity evidence |

For each review record cohort/sample sizes, funnel including abandonment, failure/correctness rates, p95 latency, spend, assistance, open defects, restore/rollback evidence, go/hold decision, exceptions with expiry and next cohort cap.

This document does not itself deploy infrastructure, purchase hosting, invite testers, rotate credentials or publish local code. Next release preparation must commit and push the reviewed implementation along with its evidence.
