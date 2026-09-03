/**
 * SERVER-ONLY AI pipeline shared by /api/ai/ask and /api/ai/mood (Task 32 / wave 1-a).
 * Imports z-ai-web-dev-sdk — must NEVER be imported from anything client-reachable.
 *
 * Also owns the small primitives every AI route reuses: defensive LLM-JSON parsing,
 * direct TMDB fetch (key never leaves the server / never logged), naive per-IP rate
 * limiting, and bounded in-memory caches.
 */

import ZAI from "z-ai-web-dev-sdk";
import type { AiTitle, AiMediaType } from "@/lib/ai-types";

/* ------------------------------------------------------------------ */
/* TMDB (direct server-side fetch — same key discipline as the proxy) */
/* ------------------------------------------------------------------ */

const TMDB_API = "https://api.themoviedb.org/3";

/** Fetch TMDB v3. Returns null on any failure — callers turn that into an honest 502. */
export async function tmdbGet<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T | null> {
  const key = process.env.TMDB_API_KEY ?? "";
  if (!key) return null;
  const sp = new URLSearchParams({ api_key: key, language: "en-US", ...params });
  try {
    const res = await fetch(`${TMDB_API}/${path}?${sp.toString()}`, {
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Defensive LLM JSON parsing                                          */
/* ------------------------------------------------------------------ */

/** Strip markdown fences / prose, then JSON.parse. Returns null instead of throwing. */
export function parseLooseJson<T = Record<string, unknown>>(raw: unknown): T | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let s = raw.trim();
  // ```json ... ``` fences (also stray ``` anywhere at the edges)
  s = s.replace(/^`{1,3}[a-z]*\s*/i, "").replace(/`{1,3}\s*$/i, "").trim();
  try {
    return JSON.parse(s) as T;
  } catch {
    /* fall through to slice */
  }
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a !== -1 && b > a) {
    try {
      return JSON.parse(s.slice(a, b + 1)) as T;
    } catch {
      return null;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* TMDB discover param sanitizing                                      */
/* ------------------------------------------------------------------ */

/** Keys the LLM may set (spec shape). Dotted TMDB keys as-is; `with_runtime_lte` translated. */
const ALLOWED_PARAM_KEYS = new Set([
  "with_genres",
  "without_genres",
  "primary_release_date.gte",
  "primary_release_date.lte",
  "vote_average.gte",
  "vote_count.gte",
  "sort_by",
  "with_runtime_lte",
  "with_original_language",
  "with_keywords",
]);

const ALLOWED_SORTS = new Set([
  "popularity.desc",
  "popularity.asc",
  "vote_average.desc",
  "vote_average.asc",
  "primary_release_date.desc",
  "primary_release_date.asc",
  "revenue.desc",
  "title.asc",
]);

function csvIds(v: unknown): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const parts = String(v)
    .split(",")
    .map((p) => p.trim())
    .filter((p) => /^\d{1,5}$/.test(p));
  if (!parts.length) return null;
  return Array.from(new Set(parts)).slice(0, 8).join(",");
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NUM_RE = /^\d{1,4}(\.\d{1,2})?$/;

/**
 * Keep only known discover params, in valid shapes, from a raw LLM object.
 * @param forTv — movies use primary_release_date.*; TV discover needs first_air_date.*.
 */
export function sanitizeDiscoverParams(
  raw: unknown,
  forTv: boolean
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;

  for (const [k, v] of Object.entries(obj)) {
    if (!ALLOWED_PARAM_KEYS.has(k)) continue;
    const str = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
    if (!str || str.length > 120) continue;

    switch (k) {
      case "with_genres":
      case "without_genres":
      case "with_keywords": {
        const csv = csvIds(str);
        if (csv) out[k] = csv;
        break;
      }
      case "primary_release_date.gte":
      case "primary_release_date.lte": {
        if (!DATE_RE.test(str)) break;
        if (forTv) out[k.replace("primary_release_date", "first_air_date")] = str;
        else out[k] = str;
        break;
      }
      case "vote_average.gte":
      case "vote_count.gte": {
        if (NUM_RE.test(str)) out[k] = str;
        break;
      }
      case "with_runtime_lte": {
        // runtime filter is a movie-discover feature only
        if (!forTv && NUM_RE.test(str)) out["with_runtime.lte"] = str;
        break;
      }
      case "with_original_language": {
        if (/^[a-z]{2}$/.test(str)) out[k] = str;
        break;
      }
      case "sort_by": {
        if (ALLOWED_SORTS.has(str)) {
          out["sort_by"] = forTv && str.startsWith("primary_release_date")
            ? str.replace("primary_release_date", "first_air_date")
            : str;
        }
        break;
      }
    }
  }
  if (!out["sort_by"]) out["sort_by"] = "popularity.desc";
  return out;
}

/* ------------------------------------------------------------------ */
/* Result shaping                                                      */
/* ------------------------------------------------------------------ */

export function toAiTitle(item: any, mediaType: AiMediaType): AiTitle {
  const date: string = item?.release_date ?? item?.first_air_date ?? "";
  const vote = typeof item?.vote_average === "number" ? item.vote_average : 0;
  return {
    id: Number(item?.id) || 0,
    media_type: mediaType,
    title: String(item?.title ?? item?.name ?? "Untitled").slice(0, 200),
    poster_path: typeof item?.poster_path === "string" ? item.poster_path : null,
    backdrop_path: typeof item?.backdrop_path === "string" ? item.backdrop_path : null,
    year: date.slice(0, 4),
    rating: Math.round(vote * 10) / 10,
  };
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Merge movie/tv result sets with a light interleave so one type doesn't own the head. */
export function mergeMedia(movieItems: AiTitle[], tvItems: AiTitle[], cap: number): AiTitle[] {
  if (!tvItems.length) return movieItems.slice(0, cap);
  if (!movieItems.length) return tvItems.slice(0, cap);
  const out: AiTitle[] = [];
  let m = 0;
  let t = 0;
  // flip a coin for the first slot, then alternate
  let movieTurn = Math.random() < 0.5;
  while (out.length < cap && (m < movieItems.length || t < tvItems.length)) {
    if (movieTurn && m < movieItems.length) out.push(movieItems[m++]);
    else if (!movieTurn && t < tvItems.length) out.push(tvItems[t++]);
    else if (m < movieItems.length) out.push(movieItems[m++]);
    else if (t < tvItems.length) out.push(tvItems[t++]);
    movieTurn = !movieTurn;
  }
  return out.slice(0, cap);
}

/* ------------------------------------------------------------------ */
/* Rate limiting (naive, per-IP, in-memory)                            */
/* ------------------------------------------------------------------ */

const buckets = new Map<string, number[]>();

/** true = allowed. Sliding window, bounded map. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 500) {
    for (const [k, v] of buckets) {
      if (v.length === 0 || v.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }
  return true;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim() || "local";
  return req.headers.get("x-real-ip")?.trim() || "local";
}

/* ------------------------------------------------------------------ */
/* Bounded in-memory caches                                            */
/* ------------------------------------------------------------------ */

export interface CacheEntry<T> {
  value: T;
  expires: number;
}

export function cacheGet<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
  const hit = map.get(key);
  if (!hit) return null;
  if (hit.expires <= Date.now()) {
    map.delete(key);
    return null;
  }
  return hit.value;
}

export function cacheSet<T>(
  map: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number,
  maxEntries = 300
): void {
  if (map.size >= maxEntries) {
    const now = Date.now();
    for (const [k, v] of map) if (v.expires <= now) map.delete(k);
    if (map.size >= maxEntries) {
      // still full → drop the oldest inserted key
      const oldest = map.keys().next().value;
      if (oldest !== undefined) map.delete(oldest);
    }
  }
  map.set(key, { value, expires: Date.now() + ttlMs });
}

/* ------------------------------------------------------------------ */
/* "Ask Reelivo" pipeline (LLM → TMDB discover)                        */
/* ------------------------------------------------------------------ */

export const ASK_SYSTEM_PROMPT = `You translate a natural-language movie/TV request into TMDB discover parameters.

Return STRICT JSON only — no markdown fences, no prose before or after:
{
  "titles": "movie" | "tv" | "both",
  "params": {
    "with_genres": "comma-separated TMDB genre ids",
    "without_genres": "comma-separated TMDB genre ids",
    "primary_release_date.gte": "YYYY-MM-DD",
    "primary_release_date.lte": "YYYY-MM-DD",
    "vote_average.gte": "5.5"–"9",
    "vote_count.gte": "e.g. 300 — ALWAYS include >=300 when sort_by is vote_average",
    "sort_by": "popularity.desc | vote_average.desc | primary_release_date.desc | revenue.desc",
    "with_runtime_lte": "minutes, e.g. 120",
    "with_original_language": "ISO 639-1 code, e.g. ja for anime, ko for K-drama",
    "with_keywords": "comma-separated REAL TMDB keyword ids — only if 100% certain, otherwise omit"
  },
  "blurb": "one-sentence editorial hook explaining the pick set",
  "labels": ["2-3 short viewer-facing chips, e.g. mind-bending, under 2h"]
}

Genre ids — movie: 28 Action, 12 Adventure, 16 Animation, 35 Comedy, 80 Crime, 99 Documentary, 18 Drama, 10751 Family, 14 Fantasy, 36 History, 27 Horror, 10402 Music, 9648 Mystery, 10749 Romance, 878 Science Fiction, 53 Thriller, 10752 War, 37 Western. TV adds/uses: 10759 Action & Adventure, 10765 Sci-Fi & Fantasy, 10767 Talk, 10764 Reality, 10766 Soap, 10763 News, 10768 War & Politics, 10762 Kids.
For TV requests still use primary_release_date.* keys — the server translates them to first-air dates.
Omit every param that does not apply. Output the JSON object and nothing else.`;

export interface AskPipelineResult {
  blurb: string;
  labels: string[];
  results: AiTitle[];
  /** which discover modes were run — useful for honest fallbacks */
  titles: "movie" | "tv" | "both";
}

export type PipelineOutcome =
  | { ok: true; data: AskPipelineResult }
  | { ok: false; status: 400 | 502; error: string };

interface RawAskJson {
  titles?: unknown;
  params?: unknown;
  blurb?: unknown;
  labels?: unknown;
}

/**
 * LLMs over-constrain discover params (hallucinated keyword ids, aggressive
 * vote_count floors) which can empty a rail. Ladder: full params → drop
 * with_keywords → relax vote_count to 100 → drop vote_average floor. The core
 * intent (genres, dates, runtime, language) is never relaxed. Stop as soon as
 * a variant fills past `needMin`.
 */
function relaxVariants(params: Record<string, string>): Record<string, string>[] {
  const variants: Record<string, string>[] = [params];
  const v1 = { ...params };
  delete v1["with_keywords"];
  if (JSON.stringify(v1) !== JSON.stringify(params)) variants.push(v1);
  const v2 = { ...v1 };
  if (v2["vote_count.gte"]) v2["vote_count.gte"] = "100";
  variants.push(v2);
  const v3 = { ...v2 };
  delete v3["vote_average.gte"];
  variants.push(v3);
  return variants;
}

async function discoverPage(
  mediaType: "movie" | "tv",
  params: Record<string, string>,
  regionParam: string | null
): Promise<AiTitle[]> {
  const p: Record<string, string> = { ...params, include_adult: "false" };
  if (mediaType === "movie") {
    // TMDB movie discover: region scopes the release-date filters
    if (regionParam) p["region"] = regionParam;
    const d = await tmdbGet<{ results?: any[] }>("discover/movie", p);
    return (d?.results ?? []).map((r) => toAiTitle(r, "movie"));
  }
  const d = await tmdbGet<{ results?: any[] }>("discover/tv", p);
  return (d?.results ?? []).map((r) => toAiTitle(r, "tv"));
}

async function runDiscover(
  mode: "movie" | "tv" | "both",
  params: Record<string, string>,
  region: string | null,
  cap: number
): Promise<AiTitle[]> {
  const wantsMovie = mode !== "tv";
  const wantsTv = mode !== "movie";
  const regionParam = region && /^[A-Za-z]{2}$/.test(region) ? region.toUpperCase() : null;
  const needMin = Math.min(6, cap);

  const jobs: Promise<AiTitle[]>[] = [];
  if (wantsMovie) {
    jobs.push((async () => {
      let best: AiTitle[] = [];
      for (const v of relaxVariants(params)) {
        const items = await discoverPage("movie", v, regionParam);
        if (items.length > best.length) best = items;
        if (best.length >= needMin) break;
      }
      return best;
    })());
  }
  if (wantsTv) {
    jobs.push((async () => {
      let best: AiTitle[] = [];
      for (const v of relaxVariants(params)) {
        const items = await discoverPage("tv", v, null); // region is not a TV-discover param
        if (items.length > best.length) best = items;
        if (best.length >= needMin) break;
      }
      return best;
    })());
  }

  const settled = await Promise.all(jobs);
  const movies = shuffle(settled[0] ?? []);
  const tv = shuffle(settled[1] ?? []);
  return mergeMedia(movies, tv, cap);
}

/**
 * Curated seed params (mood rail) — same relaxation ladder as the ask pipeline.
 * Seed params use the movie-shaped keys; translated per media type here.
 */
export async function discoverSeeds(
  seedParams: Record<string, string>,
  cap: number
): Promise<AiTitle[]> {
  const movieParams = sanitizeDiscoverParams(seedParams, false);
  const tvParams = sanitizeDiscoverParams(seedParams, true);
  const [movies, tv] = await Promise.all([
    runDiscover("movie", movieParams, null, cap),
    runDiscover("tv", tvParams, null, cap),
  ]);
  return mergeMedia(movies, tv, cap);
}

/**
 * Full ask pipeline: natural language → LLM JSON → sanitized TMDB discover → AiTitle[].
 * Throws nothing; returns typed outcome so routes can map to honest HTTP errors.
 */
export async function askPipeline(
  query: string,
  region?: string | null,
  cap = 20
): Promise<PipelineOutcome> {
  let completion: any;
  try {
    const zai = await ZAI.create();
    completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: ASK_SYSTEM_PROMPT },
        { role: "user", content: query.slice(0, 300) },
      ],
      thinking: { type: "disabled" },
    });
  } catch {
    return { ok: false, status: 502, error: "The Reelivo brain is unreachable right now. Try again in a moment." };
  }

  const text = completion?.choices?.[0]?.message?.content;
  const parsed = parseLooseJson<RawAskJson>(text);
  if (!parsed) {
    return { ok: false, status: 502, error: "The assistant returned an unreadable answer. Please rephrase and try again." };
  }

  const rawTitles = typeof parsed.titles === "string" ? parsed.titles : "both";
  const mode: "movie" | "tv" | "both" =
    rawTitles === "movie" || rawTitles === "tv" ? rawTitles : "both";
  const params = sanitizeDiscoverParams(parsed.params, false);
  const tvParams = sanitizeDiscoverParams(parsed.params, true);

  const regionClean = typeof region === "string" ? region.trim() : null;

  let results: AiTitle[] = [];
  try {
    if (mode === "both") {
      // runDiscover already shuffles each side; mergeMedia interleaves the two media types
      const [movies, tv] = await Promise.all([
        runDiscover("movie", params, regionClean, cap),
        runDiscover("tv", tvParams, regionClean, cap),
      ]);
      results = mergeMedia(movies, tv, cap);
    } else if (mode === "movie") {
      results = await runDiscover("movie", params, regionClean, cap);
    } else {
      results = await runDiscover("tv", tvParams, regionClean, cap);
    }
  } catch {
    return { ok: false, status: 502, error: "TMDB did not answer the discovery call. Try again in a moment." };
  }

  const blurb =
    typeof parsed.blurb === "string" && parsed.blurb.trim()
      ? parsed.blurb.trim().slice(0, 240)
      : "Picked fresh from the catalogue for you.";
  const labels = Array.isArray(parsed.labels)
    ? parsed.labels
        .filter((l): l is string => typeof l === "string")
        .map((l) => l.trim().slice(0, 24))
        .filter(Boolean)
        .slice(0, 3)
    : [];

  return { ok: true, data: { blurb, labels, results, titles: mode } };
}
