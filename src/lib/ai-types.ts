/**
 * Shared AI response contract — Task 32 / wave 1-a.
 * Imported by BOTH the AI backend routes (server) and UI agents (client).
 * Keep this file 100% client-safe: types only + the public MOODS chip list.
 * Server-only pipeline lives in `src/lib/ai-server.ts` (never import that from a client file).
 */

export type AiMediaType = "movie" | "tv";

/** Normalized title card shared by every AI surface (ask / mood / future rails). */
export interface AiTitle {
  id: number;
  media_type: AiMediaType;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  /** "2026" — 4-digit year slice of release/first-air date, "" when unknown. */
  year: string;
  /** TMDB vote_average, rounded to 1 decimal (0–10). */
  rating: number;
}

/** POST /api/ai/ask → 200 body. */
export interface AskResponse {
  blurb: string;
  labels: string[];
  results: AiTitle[];
}

/** GET /api/ai/verdict?type=movie|tv&id=<tmdbId> → 200 body. */
export interface VerdictResponse {
  ok: boolean;
  /** Present when ok === false: "no-reviews" | "ai-unavailable" | "bad-request" | … */
  reason?: string;
  score?: "positive" | "mixed" | "negative";
  /** Recurring praise, 2–3 short phrases. */
  pros?: string[];
  /** Recurring criticism, 1–2 short phrases. */
  cons?: string[];
  /** One crisp editorial sentence. */
  verdict?: string;
  /** Number of audience reviews the verdict is grounded in. */
  basis?: number;
}

/** GET /api/ai/mood?mood=<key> → 200 body. */
export interface MoodResponse {
  mood: string;
  label: string;
  emoji: string;
  blurb: string;
  results: AiTitle[];
}

/** POST /api/asr → 200 body. */
export interface AsrResponse {
  text: string;
}

/** Client-facing mood chip subset — keep keys in sync with MOOD_SEEDS (ai-server.ts). */
export interface MoodChip {
  key: string;
  label: string;
  emoji: string;
}

export const MOODS: MoodChip[] = [
  { key: "comfort", label: "Warm & cozy", emoji: "🛋️" },
  { key: "adrenaline", label: "High-octane", emoji: "⚡" },
  { key: "mindbend", label: "Mind-bending", emoji: "🌀" },
  { key: "tears", label: "Tearjerker", emoji: "💧" },
  { key: "laugh", label: "Laugh-out-loud", emoji: "😂" },
  { key: "date", label: "Date night", emoji: "💘" },
  { key: "spooky", label: "Spooky", emoji: "👻" },
  { key: "epic", label: "Epic scale", emoji: "🏔️" },
  { key: "true-story", label: "Based on truth", emoji: "📜" },
  { key: "anime", label: "Anime", emoji: "🌸" },
];
