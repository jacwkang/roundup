# Ara M1 — Sendblue setup and testing

Ara now uses **Sendblue**. M1 tests group messaging only; AI conversations and Resy bookings remain M2.

## 1. Prepare your Sendblue account

Sign in at [dashboard.sendblue.com](https://dashboard.sendblue.com/) and obtain an API key, API secret, and a messaging number. Confirm with Sendblue that your account has **group API access** before testing. Group messaging is a beta feature available on selected plans. AI Agent plans can reply to groups the number has been added to, but cannot create outbound groups. [Group API details](https://docs.sendblue.com/getting-started/groups).

You will add Ara to the conversation from your phone. No Google, AI-model, or Resy credentials are needed for M1.

## 2. Configure the project

From the repository root, with Node.js 22 or later:

```bash
npm install
cp -n .env.example .env.local
```

If `.env.local` already exists, edit it directly; `cp -n` will not overwrite it. Add these values, replacing placeholders:

```dotenv
SENDBLUE_API_KEY=YOUR_API_KEY
SENDBLUE_API_SECRET=YOUR_API_SECRET
SENDBLUE_WEBHOOK_SECRET=
SENDBLUE_PHONE_NUMBER=+1YOUR_SENDBLUE_NUMBER
SENDBLUE_ALLOWED_GROUP_IDS=
ARA_DATABASE_PATH=./data/ara-sendblue.db
```

Use your assigned Sendblue number with country code, not your personal number. Leave the group IDs blank for now; an empty allowlist denies every group. API calls use both credentials in server-side headers. [Sendblue security](https://docs.sendblue.com/security/).

Generate a webhook secret:

```bash
npm run sendblue -- init-secret
```

This saves a random secret to `.env.local` without printing it. If one is already set, it leaves it unchanged. Both web and worker processes load `.env.local` and `.env`; exported environment values take priority, and `.env.local` takes priority over `.env`.

## 3. Start Ara and an HTTPS tunnel

Terminal 1, in the project directory:

```bash
npm run dev
```

Open `http://localhost:3000`. Keep this process running.

Terminal 2, using an installed and authenticated ngrok client:

```bash
ngrok http 3000
```

If needed, follow [ngrok's macOS setup](https://ngrok.com/download/mac-os) to install it and add your authtoken. Use the actual port printed by Next if it selects a port other than 3000. Keep ngrok running and copy its HTTPS origin.

## 4. Register the Sendblue receive webhook

Terminal 3, in the project directory:

```bash
npm run sendblue -- subscribe https://YOUR-NGROK-DOMAIN
```

Supply only the origin, with no path or query string. The script appends a `receive` webhook at:

```text
https://YOUR-NGROK-DOMAIN/api/webhooks/sendblue
```

It attaches your configured secret, preserves unrelated webhooks, and detects an existing matching URL. If the existing URL has different secret settings, update it in **Developer → Webhooks**. If registration times out, inspect the dashboard before retrying. When the public URL changes, remove the obsolete Ara webhook there and register the new URL. [Webhook management](https://docs.sendblue.com/getting-started/webhooks/).

Alternatively, configure that exact receive URL and secret manually in Sendblue. Ara checks the `sb-signing-secret` header. This is a shared secret carried over HTTPS, not an HMAC over the message body. There is no version query parameter or unsigned bypass.

Webhooks are account-wide; Ara filters incoming messages to the configured receiving number and approved group IDs.

## 5. Add Ara to a group and approve the ID

Save your Sendblue number as **Ara** on your phone. Add it to an existing iMessage group with three friends, or create a new group from your phone containing everyone and Ara. Send a message in that group. Ara will stay silent until it is approved.

Discover the group ID:

```bash
npm run sendblue -- groups
```

This reads up to 100 recent inbound group messages from the provider and displays distinct group IDs, names, and reported transports. It does not print text, store these messages locally, or send anything. If the group is missing, send a new message and rerun. Match the ID with the conversation in Sendblue before approving it. [Message lookup API](https://docs.sendblue.com/api/resources/messages/methods/list).

Set the exact value in `.env.local`:

```dotenv
SENDBLUE_ALLOWED_GROUP_IDS=YOUR_GROUP_ID
```

IDs are opaque strings (for example `group_123456`), not necessarily UUIDs. Multiple approved IDs can be comma-separated, though the initial pilot is one group.

## 6. Restart the receiver and start the worker

In Terminal 1, press Control-C, then run:

```bash
npm run dev
```

In Terminal 3:

```bash
npm run worker
```

Keep the web server, tunnel, and worker running. Both application processes must use the same database file and settings.

Open `http://localhost:3000/api/health`. Expect `configured: true` and `chatAllowlistConfigured: true`. This endpoint checks configuration only, not API connectivity, storage health, or worker liveness.

## 7. Test from the group

1. Friend A sends **“Ara, are you there?”** Ara should introduce itself and reply in the same group.
2. Friend B sends **“Hi Ara”**. Ara should reply without repeating the introduction.
3. Friend C sends **“Ara, can you book dinner?”** Ara should explain that booking is not enabled yet.
4. Send **“Sounds good!”** Ara should stay silent; it retains the text for future context.
5. Stop the worker, send **“Ara, still there?”**, then run `npm run queue`. It should show `queued`. Restart the worker and expect one reply.
6. Restart both processes and repeat an addressed message. Introduction state should persist.
7. Send a message from an unapproved group or direct conversation. Ara should not respond or store it.

M1 replies only to messages containing the standalone name “Ara”, case-insensitively. It does not infer intent, process attachments, import earlier history, or maintain group membership. Per-group order is the order callbacks arrive, not a retroactive reorder by provider timestamp.

| Configuration | Validation status |
| --- | --- |
| Provider-shaped messages from three synthetic senders | Offline tests and restart smoke test |
| Actual Sendblue group replies | First live reply confirmed September 24, 2026; three-human-sender check pending |
| Existing versus user-created iMessage group | Pending live test |
| Mixed iPhone/Android and fallback transports | Not verified |

Record live results in `EXECUTION_PLAN.md` without committing phone numbers or message contents. M1's live validation gate stays open until the real group test passes.

## Queue behavior and uncertain sends

```bash
npm run queue
```

Status output excludes text and sender handles. The database itself contains group text and sender identities; restrict its access and backups.

| State | Meaning |
| --- | --- |
| `queued` | Accepted inbound message waiting for the worker |
| `processing` | Claimed locally, before sending; a stale 60-second lease is recoverable |
| `sending` | Send boundary committed before the network call; never automatically replayed |
| `done` | Policy ignored the message, the group was disabled, or the API accepted a reply |
| `failed` | Known HTTP rejection; inspect and fix before manual retry |
| `unknown` | Provider may have accepted the send; reconciliation required |

A `provider_message_id` is Sendblue's `message_handle`. `done` with a handle means API acceptance, not confirmed device delivery.

The [group-send API](https://docs.sendblue.com/api/resources/groups/methods/send_message) does not document an outbound idempotency key. Ara intentionally does not invent one or blindly retry sends. Network failures, HTTP 408/5xx, provider-reported errors, and malformed success responses become `unknown`. An interrupted `sending` job becomes `unknown` after its lease expires. Failed or unknown jobs block later replies in that group; other approved groups can progress.

After fixing a known HTTP rejection (for example invalid credentials):

```bash
npm run queue -- retry 12
```

For an uncertain send, stop the worker and inspect the exact group, time, and response in the Sendblue dashboard/provider records. If the provider confirms it was sent, supply its verified handle:

```bash
npm run queue -- resolve 12 sent VERIFIED_MESSAGE_HANDLE
```

Only if you establish that the send was **not** accepted or sent:

```bash
npm run queue -- resolve 12 not-sent
```

Then restart the worker. These commands record the operator's decision; they do not verify it against Sendblue. If the outcome remains uncertain, leave it held. Plain `retry` cannot clear an unknown job. Do not delete the database or change inbound IDs to force a resend.

To stop group processing, stop the worker, remove its ID from the allowlist, then restart both processes. Previously accepted provider sends cannot be recalled. To erase stored history, stop both processes and delete that group's `messages` and `chats` rows transactionally, including backups under your retention policy.

## Switching from the previous Linq setup

- Stop the old worker and receiver before switching.
- Disable/remove the Ara webhook in Linq if you created one. This code no longer serves `/api/webhooks/linq` and does not manage your Linq account.
- Add the `SENDBLUE_*` settings above. Old `LINQ_*` values are ignored and can be removed from your local environment.
- Set `ARA_DATABASE_PATH=./data/ara-sendblue.db`. Old messaging data is preserved but not migrated; startup rejects a legacy queue database so old messages cannot be sent through the new provider.
- Replace Ara's saved contact number and group membership with the Sendblue number. Old Linq chat IDs are not Sendblue group IDs; discover and approve the new ones.
- The old `npm run linq` commands and Linq setup guide were removed.

## Offline checks and hosting

```bash
npm test
npm run test:smoke
npm run typecheck
npm run lint
npm run build
```

Tests need no credentials. The smoke test uses temporary storage, an authenticated synthetic payload, and a mock outbound API; it sends no messages.

For a hosted pilot, run `npm start` (after building) and `npm run worker` as supervised long-running processes on the same host with persistent local disk, `NODE_ENV=production`, and the same absolute database path. Set the receive webhook to the host's public HTTPS origin. SQLite WAL is not intended for shared network filesystems, and this worker architecture does not run on stateless functions alone.

Monitor failed/unknown jobs and worker liveness. Automatic outbound status tracking is not implemented in M1; inspect Sendblue for delivery failures after API acceptance.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Webhook `503` | Required configuration, writable DB, accidentally reused legacy DB |
| Webhook `401` | Exact `sb-signing-secret` value matches `SENDBLUE_WEBHOOK_SECRET` |
| Webhook `400` | Sendblue receive payload has the documented message fields |
| `ignored` | Inbound/RECEIVED message, actual receiving line, exact group allowlist, nonempty text |
| No group listed | Group API enabled; number added; fresh inbound message; correct API account/line |
| Queued with no reply | Worker running on same DB, message addresses Ara, no earlier failed/unknown job |
| API `401`/`403` | Both credentials, assigned number, group entitlement/permissions |
| `unknown` | Inspect provider outcome before any resend; use reconciliation commands above |
| Old route type errors | Regenerate `.next` build cache after removing old routes |
