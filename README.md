# Reelivo

**What to watch tonight** — a film & TV discovery app with an editorial, pure-black OTT interface (SonyLIV / Prime Video / Disney+ visual language).

Find something worth your evening, see where it streams, and press play — free.

![Next.js](https://img.shields.io/badge/Next.js-16-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Tailwind](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8) ![Prisma](https://img.shields.io/badge/Prisma-ORM-darkgreen)

## Features

### Discovery
- **Editorial hero carousel** — trending picks with ken-burns stills, film-grain texture, keyboard arrows and touch swipe
- **Curated rails** — Top 10 this week, In cinemas now, Premiering this week, Best of the decade so far, Faces of the week (ranked trending people)
- **Continue watching** — resume strip with persisted playback progress
- **Browse** — genre × lens (Trending / Acclaimed / Newest) with ambient genre hero art and infinite scroll
- **Search** — multi-type search dialog (`⌘K` / `/`) with debounced queries and recent-search memory

### Title pages
- Where-to-watch provider breakdown per region (subscriptions / rent / buy)
- Cast & crew with per-person deep links, seasons & episodes ("Airs this week" badges), facts sidebar
- TMDB member reviews with **Top / Newest sorting** and paginated loading
- Free in-page playback via a multi-server embed engine (swappable source layer in `src/lib/player.ts`), next-episode auto-play, progress postMessage sync

### Personal
- **Watchlist with named lists** — file titles into custom folders ("Weekend marathon", "Prestige TV"…), rename, dissolve; save-to-list quick-pick from anywhere
- Surprise me — random pick from the current filter
- Data tool parity — export / import your watchlist as JSON
- Person pages with combined credits, known-for rail, and trending-rank badges (`№ N · Trending this week`)

### Platform
- Installable PWA (offline shell in production), OG image generation (`/api/og`), share links (`?go=movie/155`)
- Keyboard shortcuts (`?` for the cheat sheet), back-to-top, mobile bottom nav
- Hash-based SPA routing on `/` (`#/movie/123`, `#/films/horror/acclaimed`) so every state is shareable

## Tech stack

| Layer      | Choice                                                      |
| ---------- | ----------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Turbopack) + TypeScript 5           |
| Styling    | Tailwind CSS 4, pure-black theme, single cyan accent        |
| Fonts      | Manrope (display) + Inter (UI)                              |
| State      | TanStack Query (server) + Zustand (client, persisted)       |
| Database   | Prisma ORM on SQLite                                        |
| Data       | TMDB API v3 — server-proxied (`/api/tmdb/*`), path allowlist + in-memory cache |
| Playback   | Multi-server embed engine — VidLink / VidFast / VidSrc / 2Embed, swappable |

## Getting started

```bash
bun install

# TMDB API key (v3) — required, server-side only
echo "TMDB_API_KEY=your_key_here" > .env

bun run db:push   # sync Prisma schema
bun run dev       # http://localhost:3000
```

> The TMDB key never reaches the browser — all TMDB traffic goes through the
> server route with an allowlist and cache.

## Project layout

```
src/
  app/            layout, OG route, TMDB proxy route
  components/     reelivo/ — app shell, views (home, browse, detail,
                  watchlist, person, player…), shared bits
  lib/            hooks (router + TMDB client), store, format, player, types
prisma/           schema
public/           icons, manifest, service worker
```

## Notes

- Playback sources are third-party embeds; the player layer abstracts them so
  the provider can be swapped without touching UI code.
- Data and imagery come from [TMDB](https://www.themoviedb.org). This product
  uses the TMDB API but is not endorsed or certified by TMDB.
