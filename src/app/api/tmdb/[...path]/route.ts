import { NextRequest, NextResponse } from "next/server";

/**
 * TMDB proxy — keeps the API key server-side.
 * GET /api/tmdb/<tmdb-path>?<tmdb-params>
 * - Strict path allowlist
 * - Param sanitizing (api_key injected here, never forwarded from client)
 * - In-memory cache with per-resource TTL
 */

const API = "https://api.themoviedb.org/3";

/**
 * Wave 1-a verification (Task 32): paths needed by the calendar view, episode radar
 * and AI surfaces are ALL already covered below — no new patterns were required:
 *   movie/upcoming             → ^(movie|tv)/(popular|top_rated|now_playing|upcoming|…)$
 *   tv/{id} (series detail)    → ^(movie|tv)/\d+$
 *   discover/(movie|tv)        → explicit; dotted/underscored params
 *                                (primary_release_date.gte, with_runtime.lte,
 *                                with_original_language, watch_region, …) pass the
 *                                key regex /^[a-zA-Z_.]{1,40}$/ with values ≤200 chars
 *   trending/(all|movie|tv)/(day|week) → ^trending/(all|movie|tv|person)/(day|week)$
 *   (movie|tv)/{id}/reviews    → ^(movie|tv)/\d+/reviews$
 * Verified live via curl (all 200 through the cache).
 */
const ALLOWED: RegExp[] = [
  /^trending\/(all|movie|tv|person)\/(day|week)$/,
  /^(movie|tv)\/(popular|top_rated|now_playing|upcoming|on_the_air|airing_today)$/,
  /^(movie|tv)\/\d+$/,
  /^(movie|tv)\/\d+\/(credits|recommendations|similar|images|videos|watch\/providers)$/,
  /^tv\/\d+\/season\/\d+$/,
  /^search\/(multi|movie|tv)$/,
  /^discover\/(movie|tv)$/,
  /^genre\/(movie|tv)\/list$/,
  /^watch\/providers\/(movie|tv|regions)$/,
  /^person\/\d+$/,
  /^person\/\d+\/combined_credits$/,
  /^collection\/\d+$/,
  /^(movie|tv)\/\d+\/(release_dates|content_ratings)$/,
  /^(movie|tv)\/\d+\/reviews$/,
];

type Entry = { expires: number; data: unknown };
const cache = new Map<string, Entry>();

function ttlFor(path: string): number {
  if (/\/(images)$/.test(path)) return 24 * 60 * 60 * 1000;
  if (/\/(credits|videos|watch\/providers)$/.test(path)) return 6 * 60 * 60 * 1000;
  if (/\/\d+(\/|$)|genre/.test(path)) return 60 * 60 * 1000; // details, seasons, genres
  return 10 * 60 * 1000; // lists / trending / discover / search
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const { path } = await ctx.params;
  const tmdbPath = (path || []).join("/");

  if (!ALLOWED.some((re) => re.test(tmdbPath))) {
    return NextResponse.json(
      { status_message: "Path not allowed." },
      { status: 400 }
    );
  }

  // Only forward safe params; strip any client api_key.
  const incoming = req.nextUrl.searchParams;
  const clean = new URLSearchParams();
  for (const [k, v] of incoming.entries()) {
    if (k !== "api_key" && /^[a-zA-Z_.]{1,40}$/.test(k) && v.length <= 200) {
      clean.set(k, v);
    }
  }
  clean.set("api_key", process.env.TMDB_API_KEY ?? "");
  clean.set("language", clean.get("language") ?? "en-US");
  if (!clean.has("include_adult") && /^search\//.test(tmdbPath)) {
    clean.set("include_adult", "false");
  }

  const url = `${API}/${tmdbPath}?${clean.toString()}`;

  const hit = cache.get(url);
  const now = Date.now();
  if (hit && hit.expires > now) {
    return NextResponse.json(hit.data, {
      headers: { "X-Cache": "HIT", "Cache-Control": "private, max-age=60" },
    });
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(9000) });
    if (!res.ok) {
      const body = await res.text();
      return new NextResponse(body, {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    const data = (await res.json()) as unknown;
    cache.set(url, { expires: Date.now() + ttlFor(tmdbPath), data });
    if (cache.size > 600) {
      // simple sweep to keep memory bounded
      for (const [k, v] of cache) if (v.expires < Date.now()) cache.delete(k);
    }
    return NextResponse.json(data, {
      headers: { "X-Cache": "MISS", "Cache-Control": "public, max-age=120" },
    });
  } catch {
    return NextResponse.json(
      { status_message: "TMDB request failed or timed out." },
      { status: 502 }
    );
  }
}
