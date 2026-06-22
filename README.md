# Hangout Planner

A web app where friends connect Google Calendar, find mutual free time, discover popular restaurants and local events, and send AI-powered hangout proposal emails.

## Features

- **Google OAuth** — Calendar free/busy + Gmail send
- **Multi-user plans** — Invite friends by email; they connect via signed invite link
- **Availability engine** — Finds overlapping free windows across all connected calendars
- **Activity discovery** — Yelp (restaurants) + Ticketmaster & Eventbrite (events)
- **Reservation polling** — Resy availability with OpenTable deep-link fallback
- **AI suggestions** — OpenAI ranks slots and drafts proposal email copy
- **Email proposals** — Sent via Gmail API as the organizer

## Setup

### 1. Install dependencies

```bash
cd ~/Projects/hangout-planner
npm install
```

### 2. Google Cloud

1. Create or reuse a Google Cloud project
2. Enable **Google Calendar API** and **Gmail API**
3. Configure OAuth consent screen (External, add test users)
4. Create **Web application** OAuth client
   - Redirect URI: `http://localhost:3000/api/auth/callback/google`
5. Copy Client ID and Secret to `.env`

### 3. Environment variables

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_SECRET` | Yes | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | Yes | Web OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Web OAuth client secret |
| `TOKEN_ENCRYPTION_KEY` | Yes | Random string for encrypting refresh tokens |
| `OPENAI_API_KEY` | Recommended | AI suggestions (fallback logic if missing) |
| `YELP_API_KEY` | Optional | Restaurant discovery (mock data if missing) |
| `TICKETMASTER_API_KEY` | Optional | Event discovery |
| `EVENTBRITE_API_TOKEN` | Optional | Local events |

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Database (SQLite) is created automatically at `./data/hangout.db`.

## Scripts

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run test         # Run availability engine tests
npm run db:studio    # Drizzle Studio (optional)
```

## API routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/plans` | Create plan + send invites |
| POST | `/api/plans/[id]/compute-availability` | Find mutual free slots |
| POST | `/api/plans/[id]/discover-activities` | Fetch restaurants & events |
| POST | `/api/plans/[id]/check-reservations` | Poll Resy/OpenTable |
| POST | `/api/plans/[id]/suggest` | Full AI suggestion pipeline |
| POST | `/api/plans/[id]/send-proposal` | Send proposal email |
| POST | `/api/invite/[token]` | Join plan after Google sign-in |

## Privacy

We only read calendar **free/busy** — not event details. See `/privacy`.

## Tech stack

Next.js 15 · Auth.js · Drizzle · SQLite (local) · Tailwind CSS · OpenAI · Google APIs · Yelp · Ticketmaster · Eventbrite
