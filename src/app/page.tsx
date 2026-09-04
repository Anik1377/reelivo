import type { Metadata } from "next";
import { headers } from "next/headers";
import { ReelivoApp } from "@/components/reelivo/app";

/**
 * The app is a hash-routed SPA on "/", but shared links may arrive as
 * /?go=movie/155 — a query-string deep link the server CAN see. When present,
 * generateMetadata upgrades the page's OG/Twitter tags to a per-title card
 * (title, overview, generated share art), and the client converts the param
 * into the matching hash route on mount.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

interface GoTitle {
  title: string;
  overview: string;
  year: string;
  score: string;
  runtime: string;
  genres: string;
  backdropPath: string | null;
  kind: "FILM" | "SERIES";
}

const TMDB_API = "https://api.themoviedb.org/3";

async function fetchGoTitle(go: string): Promise<GoTitle | null> {
  const m = /^(movie|tv)\/(\d+)$/.exec(go);
  const key = process.env.TMDB_API_KEY;
  if (!m || !key) return null;
  const [, type, id] = m;
  try {
    const res = await fetch(
      `${TMDB_API}/${type}/${id}?api_key=${key}&language=en-US`,
      { next: { revalidate: 3600 }, signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const d = (await res.json()) as {
      title?: string;
      name?: string;
      overview?: string | null;
      release_date?: string;
      first_air_date?: string;
      vote_average?: number;
      runtime?: number | null;
      episode_run_time?: number[];
      number_of_seasons?: number;
      genres?: { name: string }[];
      backdrop_path?: string | null;
    };
    const title = d.title ?? d.name ?? "";
    if (!title) return null;
    const mins = d.runtime || d.episode_run_time?.[0] || 0;
    const h = Math.floor(mins / 60);
    const runtime = h > 0 ? `${h}h ${mins % 60}m` : mins > 0 ? `${mins}m` : "";
    const sub = [
      (d.release_date || d.first_air_date || "—").slice(0, 4),
      type === "tv" && d.number_of_seasons
        ? `${d.number_of_seasons} season${d.number_of_seasons > 1 ? "s" : ""}`
        : runtime,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      title,
      overview: (d.overview ?? "").trim(),
      year: (d.release_date || d.first_air_date || "").slice(0, 4),
      score: d.vote_average ? d.vote_average.toFixed(1) : "",
      runtime: sub,
      genres: (d.genres ?? []).slice(0, 3).map((g) => g.name).join(", "),
      backdropPath: d.backdrop_path ?? null,
      kind: type === "tv" ? "SERIES" : "FILM",
    };
  } catch {
    return null;
  }
}

function ogCardUrl(t: GoTitle): string {
  const qs = new URLSearchParams({
    title: t.title,
    kind: t.kind,
    sub: t.runtime,
    genres: t.genres,
  });
  if (t.score) qs.set("score", t.score);
  if (t.backdropPath) qs.set("img", t.backdropPath);
  qs.set("free", "1");
  return `/api/og?${qs.toString()}`;
}

/**
 * metadataBase derived from the REQUEST host. A static env fallback resolves
 * og:image against localhost (or a stale domain) — crawlers like Messenger's
 * then fetch a URL that either doesn't exist publicly or was never the host
 * the sharer used, and the card silently drops its art. Forwarded headers
 * (Caddy sets X-Forwarded-Proto / keeps Host) give us the exact public origin
 * every unfurl URL should be absolute against.
 */
async function requestMetadataBase(): Promise<URL> {
  const h = await headers();
  const host =
    h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const isLocal = /^(localhost|127\.|\[::1\])(:\d+)?$/.test(host);
  const proto =
    h.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
  return new URL(`${proto}://${host}`);
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const sp = await searchParams;
  const go = typeof sp.go === "string" ? sp.go : "";
  const base = await requestMetadataBase();
  const title = go ? await fetchGoTitle(go) : null;

  /* No (or unresolvable) deep link — keep the layout's generic card but pin
   * metadataBase to the request host so even the generic /api/og unfurls with
   * an absolute, publicly fetchable image URL. */
  if (!title) {
    return { metadataBase: base };
  }

  const ogTitle = `${title.title}${title.year ? ` (${title.year})` : ""}`;
  const ogDescription =
    (title.overview ? `${title.overview.slice(0, 157)}…` : null) ??
    "See where it streams and press play — free, no account needed.";
  const ogAlt = `${ogTitle} — watch free on Reelivo`;

  return {
    metadataBase: base,
    title: `${ogTitle} — watch free on Reelivo`,
    description: ogDescription,
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url: `/?go=${go}`,
      siteName: "Reelivo",
      locale: "en_US",
      type: "website",
      images: [
        {
          url: ogCardUrl(title),
          width: 1200,
          height: 630,
          alt: ogAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${ogTitle} — Reelivo`,
      description: ogDescription,
      images: [
        {
          url: ogCardUrl(title),
          width: 1200,
          height: 630,
          alt: ogAlt,
        },
      ],
    },
  };
}

export default function Page() {
  return <ReelivoApp />;
}
