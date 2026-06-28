# Beyond Kw

AI-powered social discovery for Kuwait. Beyond Kw helps friends (ages 16–45) plan
outings, discover new places, and share trusted recommendations — so plans stop
getting lost across a dozen messaging apps.

> **Status:** Frontend MVP. This is a **frontend-only** build with mock data — no
> backend is wired up yet. Auth, the database, AI, and payments are left as clearly
> marked integration points (see [Next steps](#next-steps)).

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** with a custom design system (see `src/app/globals.css`)
- **Plus Jakarta Sans** (display) + **Inter** (body) via `next/font`

The design system — the "Sophisticated Violet" palette, typography, radii, and soft
ambient shadows — is taken from `DESIGN.md` and encoded as Tailwind theme tokens and
component classes (`.card`, `.chip`, `.btn-primary`, `.fab`, …).

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The UI is mobile-first and
renders inside a phone frame on wider screens.

## Screens

| Route        | Screen        | What it shows                                                            |
| ------------ | ------------- | ------------------------------------------------------------------------ |
| `/`          | **Home**      | Greeting, semantic search, filter chips, AI place picks, discover grid   |
| `/community` | **Community** | Friends online, nearby & check-ins, ping a friend, planned hangouts      |
| `/ai`        | **AI**        | Chat assistant that plans outings (mock replies)                         |
| `/groups`    | **Groups**    | Friend groups, members, recent activity, upcoming plans                  |
| `/profile`   | **Profile**   | Profile, stats, in-app notifications, notification preferences           |

Bottom navigation: Home · Community · AI · Groups · Profile.

> The **admin panel** from the PRD was intentionally left out of this MVP.

## Project structure

```
src/
├─ app/
│  ├─ layout.tsx        # fonts + phone-frame shell + bottom nav
│  ├─ globals.css       # design system (tokens + component classes)
│  ├─ page.tsx          # Home
│  ├─ community/        # Community
│  ├─ ai/               # AI assistant (client component)
│  ├─ groups/           # Groups
│  └─ profile/          # Profile (client component)
├─ components/          # Avatar, BottomNav, AiFab, icons
└─ lib/
   ├─ types.ts          # domain types (shaped like the future DB tables)
   └─ mock-data.ts      # all mock data — swap for real queries later
```

## Next steps (backend integration)

The mock data in `src/lib/mock-data.ts` is shaped to mirror the eventual schema, so
each integration below is mostly a drop-in swap:

- **Supabase** — Google OAuth sign-in, Postgres + RLS, Realtime presence/updates,
  Storage for image & avatar uploads.
- **OpenRouter** — replace `mockAssistantReply` and the static recommendations with
  streamed model responses and personalized picks.
- **Maps & geocoding** — Mapbox / Google for real markers and location search.
- **Payments** — MyFatoorah or Tap for one-time payments and subscriptions.
