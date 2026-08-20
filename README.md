# Hangout Planner

Mobile-friendly hangout planning: one shareable link for the group, a coordinator view for the organizer, and in-app voting.

## MVP flow

1. **Organizer** creates a plan (city + date range) → **coordinator view** with invite link
2. **Organizer** copies link into group chat
3. **Friends** open `/join/[token]` → sign in with Google → enter preferences
4. **Organizer** taps **Generate options** when ready (variable group size)
5. **Same link** becomes the voting page for everyone

## Post-MVP

- Google Maps saved lists per user for personalized restaurant picks
- Natural language availability without calendar
- SMS / email notifications
- Auto-booking on user's behalf

## Setup

```bash
cd ~/Projects/hangout-planner
npm install
cp .env.example .env
# Fill GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_SECRET, TOKEN_ENCRYPTION_KEY
npm run dev
```

### Google OAuth

- Enable **Google Calendar API**
- OAuth client type: **Web application**
- Redirect: `http://localhost:3000/api/auth/callback/google`
- Add test users on consent screen

## Routes

| Path | Who | Purpose |
|------|-----|---------|
| `/plans/new` | Organizer | Create plan |
| `/plans/[id]/coordinate` | Organizer | Share link, see joiners, generate options |
| `/join/[token]` | Friends | Sign in, preferences, then vote |
| `/api/join/[token]` | API | Join state + submit preferences |

## Tech stack

Next.js 15 · Auth.js · Drizzle · SQLite · Tailwind · OpenAI · Google Calendar
