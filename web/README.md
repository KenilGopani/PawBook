# PawBook Web

A web client for the PawBook backend — built primarily so the ~50 Edge
Functions are something you can *see and click*, not just read.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173.

It runs with no backend by default: with no Supabase env vars set, every
API call resolves from the demo dataset in `src/lib/mock.ts`, so the whole
UI is explorable before Docker or Supabase are running.

### Point it at a live backend

```bash
cp .env.example .env.local
# fill in the two values, then restart the dev server
```

```
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<anon key from `supabase status`>
```

With those set, `src/lib/api.ts` calls the real Edge Functions instead.
The API Inspector header tells you which mode you're in.

## The API Inspector

The floating button, bottom-right. It logs every backend call the UI
makes — the function name, which spec area it belongs to, latency, and
what that call does downstream (Postgres writes, Neo4j Cypher, APNs
pushes, whether an `Idempotency-Key` was sent).

It exists because a finished screen hides the backend: tapping "Add
friend" looks like one action, but it's `send-friend-request` writing a
`pet_relationships` row, merging a `SENT_REQUEST_TO` edge in Neo4j, and
inserting a notification. Expand any row to see that.

Note: in `npm run dev`, React StrictMode intentionally double-invokes
effects, so read-only loads appear twice in the log. Production builds
show each call once.

## Layout

```
src/
├── lib/
│   ├── api.ts        one wrapper per Edge Function, + mock fallback
│   ├── apiLog.ts     pub/sub feeding the Inspector
│   ├── mock.ts       demo dataset (mutations really mutate it)
│   ├── types.ts      mirrors the Postgres schema
│   └── store.tsx     theme, active pet, toasts
├── components/
│   ├── glass.tsx     Liquid Glass primitives
│   ├── motion.tsx    AnimatedGroup, TextEffect, Tilt, BorderTrail…
│   ├── AppShell.tsx  rail nav / mobile tab bar
│   └── ApiInspector.tsx
└── screens/          Feed, Discover, Pets, Meetups, Places, Alerts, Notifications
```

## Design notes

The visual language is Apple's Liquid Glass. The material is defined once
as `.glass` in `index.css` and everything composes it, so surfaces stay
consistent. Three things make it read as glass rather than a grey box:

1. **Paired inset shadows** — bright on the top rim, dim on the bottom.
   That pair is what implies a physical pane catching light.
2. **The ambient field** — slow-drifting colour orbs behind everything.
   Glass is invisible without something to refract; in dark mode the orbs
   need *more* presence, not less, or the material falls flat.
3. **Spring motion** — physical materials settle, they don't ease to a
   stop on a timer, so animations are spring-based throughout.

Theming is driven by a `data-theme` attribute, and `index.css` maps
Tailwind's `dark:` variant onto it via `@custom-variant` — otherwise
`dark:` would follow the OS setting and disagree with the in-app toggle.

Material UI is deliberately not used: Material Design's opaque, elevated
surfaces work against this aesthetic, and mixing its styling layer with
Tailwind causes specificity fights.
