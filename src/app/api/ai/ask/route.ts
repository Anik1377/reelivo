import { NextRequest, NextResponse } from "next/server";

import {
  askPipeline,
  cacheGet,
  cacheSet,
  clientIp,
  rateLimit,
  type CacheEntry,
} from "@/lib/ai-server";
import type { AskResponse } from "@/lib/ai-types";

export const runtime = "nodejs";

/**
 * POST /api/ai/ask — "Ask Reelivo" recommendation backend.
 * Body: { query: string, region?: string }
 * → { blurb, labels, results: AiTitle[] }  (see AskResponse in lib/ai-types.ts)
 *
 * Pipeline: LLM (NL → TMDB discover params) → sanitized TMDB discover → normalized titles.
 * Identical query+region responses are cached in-memory for 10 minutes.
 * Naive rate limit: 15 requests / minute / IP.
 */

const ASK_CACHE_TTL_MS = 10 * 60 * 1000;
const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 60 * 1000;

const askCache = new Map<string, CacheEntry<AskResponse>>();

export async function POST(req: NextRequest) {
  if (!rateLimit(`ask:${clientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return NextResponse.json(
      { error: "Too many asks in a minute — take a breath and try again shortly." },
      { status: 429, headers: { "Retry-After": "30" } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const b = (body ?? {}) as { query?: unknown; region?: unknown };
  const query = typeof b.query === "string" ? b.query.trim() : "";
  const region = typeof b.region === "string" ? b.region.trim() : null;

  if (query.length < 2 || query.length > 300) {
    return NextResponse.json(
      { error: "Ask in 2–300 characters — e.g. “a mind-bending thriller under two hours”." },
      { status: 400 }
    );
  }

  const cacheKey = `${query.toLowerCase()}|${(region ?? "").toUpperCase()}`;
  const cached = cacheGet<AskResponse>(askCache, cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache": "HIT", "Cache-Control": "private, max-age=60" },
    });
  }

  const outcome = await askPipeline(query, region, 20);
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }

  const payload: AskResponse = {
    blurb: outcome.data.blurb,
    labels: outcome.data.labels,
    results: outcome.data.results,
  };
  cacheSet(askCache, cacheKey, payload, ASK_CACHE_TTL_MS);

  return NextResponse.json(payload, {
    headers: { "X-Cache": "MISS", "Cache-Control": "private, max-age=60" },
  });
}
