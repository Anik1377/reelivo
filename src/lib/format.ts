import type { MediaItem, MediaType } from "./tmdb-types";

export const IMG = "https://image.tmdb.org/t/p";

export function still(
  path?: string | null,
  size: "w300" | "w780" | "w1280" | "original" = "w780"
): string | null {
  return path ? `${IMG}/${size}${path}` : null;
}

export function poster(path?: string | null, size: "w185" | "w342" | "w780" = "w342") {
  return path ? `${IMG}/${size}${path}` : null;
}

export function profile(path?: string | null, size: "w185" = "w185") {
  return path ? `${IMG}/${size}${path}` : null;
}

export function logo(path?: string | null, size: "w92" | "w154" = "w92") {
  return path ? `${IMG}/${size}${path}` : null;
}

export function titleOf(item: Pick<MediaItem, "title" | "name">): string {
  return item.title ?? item.name ?? "Untitled";
}

export function typeOf(
  item: Pick<MediaItem, "media_type" | "first_air_date" | "release_date" | "title" | "name">
): MediaType {
  if (item.media_type === "movie" || item.media_type === "tv") return item.media_type;
  return item.first_air_date || (item.name && !item.title) ? "tv" : "movie";
}

export function yearOf(
  item?: Pick<MediaItem, "release_date" | "first_air_date"> | null
): string {
  const d = item?.release_date || item?.first_air_date;
  return d ? d.slice(0, 4) : "—";
}

export function dateOf(item: Pick<MediaItem, "release_date" | "first_air_date">): string {
  const d = item.release_date || item.first_air_date;
  if (!d) return "Unknown date";
  const parsed = new Date(`${d}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function runtime(mins?: number | null): string {
  if (!mins || mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}`.trim() : `${m}m`;
}

export function score(n?: number): string {
  return typeof n === "number" && n > 0 ? n.toFixed(1) : "—";
}

/** First sentence or ~180 chars of an overview — the editorial "dek". */
export function dek(overview?: string | null): string {
  if (!overview) return "";
  const firstSentences = overview.match(/^.+?[.!?](\s|$)/);
  const s = (firstSentences ? firstSentences[0] : overview).trim();
  return s.length > 200 ? `${s.slice(0, 197)}…` : s;
}

/** URL-safe slug for shareable genre states — "Science Fiction" → "science-fiction". */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const GENRE_FALLBACK: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
  27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance",
  878: "Sci-Fi", 10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
  10759: "Action & Adventure", 10762: "Kids", 10763: "News", 10764: "Reality",
  10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk", 10768: "War & Politics",
};

export function genreNames(ids?: number[], count = 2): string {
  if (!ids?.length) return "";
  return ids
    .map((g) => GENRE_FALLBACK[g] ?? "")
    .filter(Boolean)
    .slice(0, count)
    .join(" · ");
}

export function todayLine(): string {
  const now = new Date();
  return now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function airLabel(d?: string | null): string {
  if (!d) return "";
  const parsed = new Date(`${d}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Current Mon–Sun window as ISO dates (UTC) — shared by the home rail and episode badges. */
export function weekWindow(): { gte: string; lte: string; today: string } {
  const now = new Date();
  const day = now.getDay(); // 0 Sun … 6 Sat
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + offsetToMonday);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { gte: iso(mon), lte: iso(sun), today: iso(now) };
}
