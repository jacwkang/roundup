# Hangout Planner

A mobile-friendly web app where friends connect Google Calendar, an organizer generates AI hangout options when the group is ready, and everyone votes on their favorite.

## Features (MVP)

- **Google OAuth** — Calendar free/busy for scheduling
- **Shareable invite link** — Drop in a group text; friends connect on their phone
- **Generate when ready** — Organizer manually triggers AI after a variable number of people join
- **In-app voting** — Options displayed on the plan page; tap to vote (multiple choices OK)
- **Activity discovery** — Yelp restaurants + Ticketmaster & Eventbrite events
- **Reservation links** — Resy/OpenTable availability where found

## Post-MVP

- Google Maps saved lists per user for personalized restaurant picks
- Natural language availability input (without calendar)
- Email/SMS proposal delivery
- Conversational agent and booking on user's behalf

## Setup

### 1. Install dependencies

```bash
cd ~/Projects/hangout-planner
npm install
```

### 2. Google Cloud

1. Create or reuse a Google Cloud project
2. Enable **Google Calendar API** and **Gmail API** (Gmail optional for MVP voting flow)
3. Configure OAuth consent screen (External, add test users)
4. Create **Web application** OAuth client
   - Redirect URI: `http://localhost:3000/api/auth/callback/google`
5. Copy Client ID and Secret to `.env`

### 3. Environment variables

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

Open [http://localhost:3000](http://localhost:3000) on your phone or browser.

## Flow

1. Organizer creates a plan and invites friends (email sends invite links)
2. Friends open the link on mobile → sign in with Google
3. Organizer waits for people to join, then taps **Generate results**
4. AI finds mutual free times, restaurants, events, and reservation slots
5. Everyone votes on options on the plan page — leading option shown at top

## Scripts

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run test         # Run availability engine tests
```

## API routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/plans` | Create plan + send invites |
| POST | `/api/plans/[id]/generate` | Generate votable options (organizer) |
| GET | `/api/plans/[id]/results` | Get options + vote counts |
| POST | `/api/plans/[id]/vote` | Toggle vote on an option |
| POST | `/api/plans/[id]/compute-availability` | Find mutual free slots only |
| POST | `/api/invite/[token]` | Join plan after Google sign-in |

## Privacy

We only read calendar **free/busy** — not event details. See `/privacy`.

## Tech stack

Next.js 15 · Auth.js · Drizzle · SQLite · Tailwind CSS · OpenAI · Google Calendar API · Yelp · Ticketmaster · Eventbrite
