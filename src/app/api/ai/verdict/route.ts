import { NextRequest, NextResponse } from "next/server";

import { cacheGet, cacheSet, parseLooseJson, tmdbGet, type CacheEntry } from "@/lib/ai-server";
import type { VerdictResponse } from "@/lib/ai-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ai/verdict?type=movie|tv&id=<tmdbId>
 * → 200 VerdictResponse (see lib/ai-types.ts)
 *    · ok:false, reason:"no-reviews"   → UI hides the panel
 *    · ok:false, reason:"ai-unavailable" → UI may show a soft retry
 * → 400 bad type/id, 502 TMDB/LLM failure
 *
 * Distills up to 8 TMDB audience reviews into a balanced verdict via the LLM.
 * Cached per type:id for 24 hours.
 */

const VERDICT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_REVIEWS = 8;
const REVIEW_TRUNCATE = 600;

const verdictCache = new Map<string, CacheEntry<VerdictResponse>>();

 
const VERDICT_SYSTEM_PROMPT = `You are a seasoned film critic writing for Reelivo, a film & TV discovery app. You distill audience reviews into a balanced verdict.

Return STRICT JSON only — no markdown fences, no prose before or after:
{ "score": "positive"|"mixed"|"negative", "pros": ["..."], "cons": ["..."], "verdict": "..." }

Rules:
- "score": the overall audience leaning across the reviews provided.
- "pros": 2–3 short phrases (max 12 words each) naming the recurring praise. Ground them in the reviews — never invent.
- "cons": 1–2 short phrases naming the recurring criticism. If truly none, return one gentle honest caveat.
- "verdict": one crisp sentence an editor would publish, in the app's editorial voice. No spoilers.
Output the JSON object and nothing else.`;

function clampStr(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type");
  const id = req.nextUrl.searchParams.get("id");

  if (type !== "movie" && type !== "tv") {
    return NextResponse.json(
      { ok: false, reason: "bad-request" },
      { status: 400 }
    );
  }
  const idNum = Number(id);
  if (!id || !Number.isInteger(idNum) || idNum <= 0 || idNum > 2 ** 31) {
    return NextResponse.json(
      { ok: false, reason: "bad-request" },
      { status: 400 }
    );
  }

  const cacheKey = `${type}:${idNum}`;
  const cached = cacheGet<VerdictResponse>(verdictCache, cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "X-Cache": "HIT", "Cache-Control": "private, max-age=300" },
    });
  }

  // details (title/year/rating for the prompt) + reviews, in parallel
  const [detail, reviewsRes] = await Promise.all([
    tmdbGet<any>(`${type}/${idNum}`),
    tmdbGet<{ results?: any[] }>(`${type}/${idNum}/reviews`),
  ]);

  if (!detail || !reviewsRes) {
    return NextResponse.json(
      { ok: false, reason: "tmdb-unavailable" },
      { status: 502 }
    );
  }

  const title = String(detail.title ?? detail.name ?? "This title");
  const date = String(detail.release_date ?? detail.first_air_date ?? "");
  const year = date.slice(0, 4);
  const rating =
    typeof detail.vote_average === "number" ? detail.vote_average.toFixed(1) : "?";

  const reviews = (reviewsRes.results ?? [])
    .slice(0, MAX_REVIEWS)
    .map((r) => ({
      author: String(r?.author ?? "audience").slice(0, 60),
      content: String(r?.content ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, REVIEW_TRUNCATE),
      rating: r?.author_details?.rating,
    }))
    .filter((r) => r.content.length > 0);

  if (reviews.length === 0) {
    const none: VerdictResponse = { ok: false, reason: "no-reviews" };
    // cache the honest empty too, so TMDB's review-less back catalogue doesn't re-hit the API
    cacheSet(verdictCache, cacheKey, none, VERDICT_CACHE_TTL_MS);
    return NextResponse.json(none);
  }

  const reviewsBlock = reviews
    .map(
      (r, i) =>
        `[Review ${i + 1}${typeof r.rating === "number" ? ` · rated ${r.rating}/10` : ""}] ${r.content}`
    )
    .join("\n\n");

  const userPrompt = `Title: "${title}"${year ? ` (${year})` : ""} · TMDB audience score: ${rating}/10 · ${type === "tv" ? "TV series" : "Movie"}\n\nAudience reviews to distill:\n\n${reviewsBlock}`;

  let completion: any;
  try {
    const { default: ZAI } = await import("z-ai-web-dev-sdk");
    const zai = await ZAI.create();
    completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: VERDICT_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      thinking: { type: "disabled" },
    });
  } catch {
    return NextResponse.json(
      { ok: false, reason: "ai-unavailable" },
      { status: 502 }
    );
  }

  const text = completion?.choices?.[0]?.message?.content;
  const parsed = parseLooseJson<any>(text);
  if (!parsed || typeof parsed !== "object") {
    return NextResponse.json(
      { ok: false, reason: "ai-unavailable" },
      { status: 502 }
    );
  }

  const scoreRaw = typeof parsed.score === "string" ? parsed.score : "";
  const score: VerdictResponse["score"] =
    scoreRaw === "positive" || scoreRaw === "negative" || scoreRaw === "mixed"
      ? scoreRaw
      : "mixed";

  const pros = Array.isArray(parsed.pros)
    ? parsed.pros.map((p: unknown) => clampStr(p, 90)).filter((p: string | null): p is string => !!p).slice(0, 3)
    : [];
  const cons = Array.isArray(parsed.cons)
    ? parsed.cons.map((c: unknown) => clampStr(c, 90)).filter((c: string | null): c is string => !!c).slice(0, 2)
    : [];
  const verdictLine = clampStr(parsed.verdict, 220);

  const payload: VerdictResponse = {
    ok: true,
    score,
    pros: pros.length ? pros : ["Audiences found it worth their time"],
    cons: cons.length ? cons : ["Praise outweighs the gripes in these reviews"],
    verdict: verdictLine ?? `Audiences are broadly ${score === "negative" ? "cool" : score} on ${title}.`,
    basis: reviews.length,
  };
  cacheSet(verdictCache, cacheKey, payload, VERDICT_CACHE_TTL_MS);

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
 
