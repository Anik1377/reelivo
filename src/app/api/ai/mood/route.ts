import { NextRequest, NextResponse } from "next/server";

import {
  askPipeline,
  cacheGet,
  cacheSet,
  clientIp,
  mergeMedia,
  rateLimit,
  sanitizeDiscoverParams,
  shuffle,
  tmdbGet,
  toAiTitle,
  type CacheEntry,
} from "@/lib/ai-server";
import type { AiTitle, MoodResponse } from "@/lib/ai-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

 
/**
 * GET /api/ai/mood?mood=<key>
 * → 200 MoodResponse (see lib/ai-types.ts) — curated mood rail, capped at 16 titles.
 * Unknown keys fall back to the ask pipeline (LLM → discover) using the raw string.
 * Cached per mood key for 1 hour. Naive rate limit: 30 req/min/IP.
 *
 * The 10 curated keys must stay in sync with the client-facing `MOODS` chips in
 * lib/ai-types.ts (label + emoji are duplicated there by design — that file is client-safe).
 */

const MOOD_CACHE_TTL_MS = 60 * 60 * 1000;
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 1000;
const CAP = 16;

interface MoodSeed {
  label: string;
  emoji: string;
  blurb: string;
  /** Same shape the ask-LLM emits; run through sanitizeDiscoverParams per media type. */
  params: Record<string, string>;
}

const MOOD_SEEDS: Record<string, MoodSeed> = {
  comfort: {
    label: "Warm & cozy",
    emoji: "🛋️",
    blurb: "Soft edges, happy endings, zero stress.",
    params: { with_genres: "10751,35", "vote_average.gte": "7", "vote_count.gte": "1000", sort_by: "popularity.desc" },
  },
  adrenaline: {
    label: "High-octane",
    emoji: "⚡",
    blurb: "Chases, fights and ticking clocks.",
    params: { with_genres: "28,53", "vote_average.gte": "6.5", "vote_count.gte": "1000", sort_by: "popularity.desc" },
  },
  mindbend: {
    label: "Mind-bending",
    emoji: "🌀",
    blurb: "Plots that reward a second watch.",
    params: { with_genres: "878,9648", "vote_average.gte": "7", "vote_count.gte": "1500", sort_by: "vote_average.desc" },
  },
  tears: {
    label: "Tearjerker",
    emoji: "💧",
    blurb: "Bring a blanket — maybe two.",
    params: { with_genres: "18,10749", "vote_average.gte": "7", "vote_count.gte": "800", sort_by: "vote_average.desc" },
  },
  laugh: {
    label: "Laugh-out-loud",
    emoji: "😂",
    blurb: "Comedies that still land.",
    params: { with_genres: "35", "vote_average.gte": "7", "vote_count.gte": "1000", sort_by: "popularity.desc" },
  },
  date: {
    label: "Date night",
    emoji: "💘",
    blurb: "Chemistry-forward picks for two.",
    params: { with_genres: "10749", "vote_average.gte": "6.8", "vote_count.gte": "600", sort_by: "popularity.desc" },
  },
  spooky: {
    label: "Spooky",
    emoji: "👻",
    blurb: "Lights low, volume up.",
    params: { with_genres: "27,53", "vote_average.gte": "6", "vote_count.gte": "500", sort_by: "popularity.desc" },
  },
  epic: {
    label: "Epic scale",
    emoji: "🏔️",
    blurb: "Sagas with real scale and sweep.",
    params: { with_genres: "12,14", "vote_average.gte": "7", "vote_count.gte": "2000", sort_by: "vote_average.desc" },
  },
  "true-story": {
    label: "Based on truth",
    emoji: "📜",
    blurb: "True stories that stick with you.",
    params: { with_genres: "99", "vote_average.gte": "7.2", "vote_count.gte": "300", sort_by: "vote_average.desc" },
  },
  anime: {
    label: "Anime",
    emoji: "🌸",
    blurb: "Hand-drawn worlds worth getting lost in.",
    params: { with_genres: "16", with_original_language: "ja", "vote_average.gte": "7", "vote_count.gte": "300", sort_by: "popularity.desc" },
  },
};

async function discoverBoth(
  seedParams: Record<string, string>,
  cap: number
): Promise<AiTitle[]> {
  const movieParams = sanitizeDiscoverParams(seedParams, false);
  const tvParams = sanitizeDiscoverParams(seedParams, true);
  const [movieRes, tvRes] = await Promise.all([
    tmdbGet<any>("discover/movie", { ...movieParams, include_adult: "false" }),
    tmdbGet<any>("discover/tv", { ...tvParams, include_adult: "false" }),
  ]);
  const rawMovies: any[] = movieRes?.results ?? [];
  const rawTv: any[] = tvRes?.results ?? [];
  const movies = shuffle(rawMovies.map((r) => toAiTitle(r, "movie")));
  const tv = shuffle(rawTv.map((r) => toAiTitle(r, "tv")));
  return mergeMedia(movies, tv, cap);
}
 

const moodCache = new Map<string, CacheEntry<MoodResponse>>();

export async function GET(req: NextRequest) {
  if (!rateLimit(`mood:${clientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return NextResponse.json(
      { error: "Slow down a touch — try again in a few seconds." },
      { status: 429, headers: { "Retry-After": "15" } }
    );
  }

  const moodRaw = req.nextUrl.searchParams.get("mood") ?? "";
  const mood = moodRaw.trim().toLowerCase();
  if (!mood || mood.length > 60) {
    return NextResponse.json(
      { error: "Provide a mood key (1–60 chars), e.g. /api/ai/mood?mood=comfort" },
      { status: 400 }
    );
  }

  const cached = cacheGet<MoodResponse>(moodCache, mood);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache": "HIT", "Cache-Control": "private, max-age=300" },
    });
  }

  const seed = MOOD_SEEDS[mood];
  let payload: MoodResponse;

  if (seed) {
    let results: AiTitle[] = [];
    try {
      results = await discoverBoth(seed.params, CAP);
    } catch {
      return NextResponse.json(
        { error: "TMDB did not answer the discovery call. Try again in a moment." },
        { status: 502 }
      );
    }
    payload = { mood, label: seed.label, emoji: seed.emoji, blurb: seed.blurb, results };
  } else {
    // LLM fallback: treat the unknown key as a natural-language ask
    const outcome = await askPipeline(mood, null, CAP);
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    }
    payload = {
      mood,
      label: mood
        .split(/[\s_-]+/)
        .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
        .join(" "),
      emoji: "🎬",
      blurb: outcome.data.blurb,
      results: outcome.data.results,
    };
  }

  cacheSet(moodCache, mood, payload, MOOD_CACHE_TTL_MS);
  return NextResponse.json(payload, {
    headers: { "X-Cache": "MISS", "Cache-Control": "private, max-age=300" },
  });
}
