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

export function profile(path?: string | null, size: "w185" | "w342" = "w185") {
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
    timeZone: "UTC",
  });
}

export function airLabel(d?: string | null): string {
  if (!d) return "";
  const parsed = new Date(`${d}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Current Mon–Sun window as ISO dates — shared by the home rail and episode badges.
 * MUST be pure UTC: this runs during SSR *and* on the client's first render, and the
 * two environments have different timezones (server=UTC, user=anywhere). The original
 * local-math version (`getDay` + `setDate` on a non-midnight instant, then
 * `toISOString`) let a UTC+6 client compute "Week of Aug 30" while the UTC server
 * streamed "Week of Aug 31" — a hydration mismatch on the label, divergent discover
 * query params, and flipped "Premieres/Premiered" strings. UTC math is identical on
 * every machine for the same instant, so server and client always agree. */
export function weekWindow(): { gte: string; lte: string; today: string } {
  const now = new Date();
  const day = now.getUTCDay(); // 0 Sun … 6 Sat (UTC calendar)
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setUTCDate(now.getUTCDate() + offsetToMonday);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  return { gte: dayIso(mon), lte: dayIso(sun), today: dayIso(now) };
}

/* ------------------------------ calendar math ------------------------------ */
/* Task-29 rule: shared Date-derived output MUST be pure UTC — getUTC / setUTC
 * / toISOString only (never local getters mixed with ISO strings), so the
 * server render and the client's first render always agree. Every helper
 * below follows it. */

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Six Monday-start weeks (6×7 = 42 UTC Dates) covering `month` — a fixed
 * grid, so layouts never flip between 4/5/6 rows. `month` is 0-indexed
 * (0 = January … 11 = December), matching Date's UTC constructors. Cells
 * outside the month render as the neighbouring month's days (calendar
 * convention); use dayIso() + string prefix checks to tell them apart. */
export function monthMatrix(year: number, month: number): Date[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Mon=0 … Sun=6 — blanks before the 1st
  const cursor = new Date(first);
  cursor.setUTCDate(first.getUTCDate() - lead);
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** UTC calendar date of an instant — YYYY-MM-DD (the TMDB date format). */
export function dayIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parse a YYYY-MM-DD ISO date (a datetime prefix is fine) into its parts.
 * `m` is 1-based, exactly as written in the string — pass m − 1 to
 * monthMatrix/prettyMonth. Returns null for junk (zero-throw; callers render
 * their fallback), matching the parseHash guard philosophy. */
export function isoParts(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

/** "today" / "tomorrow" / "in 3 days" / "yesterday" / "2 days ago" — computed
 * on the UTC calendar so every machine agrees (Task-29). Reads the clock, so
 * it is NOT for SSR-rendered text: call it after mount, same discipline as the
 * time-of-day greeting. Returns "" for unparseable input. */
export function relativeDue(iso: string): string {
  const p = isoParts(iso);
  if (!p) return "";
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const due = Date.UTC(p.y, p.m - 1, p.d);
  const days = Math.round((due - today) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** "September 2025" — from a literal month-name array, never the locale, so
 * SSR and client render byte-identical text (hydration safety). `month` is
 * 0-indexed, matching monthMatrix. */
export function prettyMonth(year: number, month: number): string {
  const name = MONTH_NAMES[month];
  return name ? `${name} ${year}` : String(year);
}

/** TMDB endpoints occasionally return the same title more than once —
 * infinite-query pages can overlap when the server's total count shifts
 * between fetches, and discover/provider mashups double-row too. Duplicate
 * React keys break reconciliation (console: "two children with the same
 * key") and duplicate cards read as a glitch — keep the first sighting.
 * The composite key also guards mixed movie/tv lists, where numeric ids
 * collide across types. */
export function uniqueById<T extends { id: number; media_type?: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = `${item.media_type ?? ""}-${item.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}
