/**
 * Playback sources — a multi-server engine, swappable by design.
 *
 * The original single-source provider shut down (domain no longer resolves),
 * so playback now routes through FOUR independent providers, ordered by user
 * experience — fewest ads first:
 *
 *   1. VidLink  vidlink.pro    clean player, themable, posts progress events
 *   2. VidFast  vidfast.pro    slick autoplay player, minimal interruptions
 *   3. VidSrc   vidsrc.to      the reliable classic, widest title coverage
 *   4. 2Embed   2embed.cc      battle-tested backup (heavier ad load)
 *
 * The player view renders a server selector; the chosen server persists at
 * device level (store.streamServer). A provider posting progress postMessages
 * keeps resume, the mini-player card and history stats alive.
 */

export const ACCENT_HEX = "00a8e1"; // Reelivo electric cyan, no '#'

export type ServerId = "vidlink" | "vidfast" | "vidsrc" | "2embed";

type BuildArgs = {
  type: "movie" | "tv";
  id: number;
  season?: number;
  episode?: number;
};

export interface StreamServer {
  id: ServerId;
  /** Display name. */
  name: string;
  /** Display host (no protocol) — shown in the picker so users know the source. */
  host: string;
  /** One-line pitch shown in the picker. */
  blurb: string;
  /** 1 = fewest ads, 3 = heaviest. Drives the ad-load dots in the picker. */
  adLoad: 1 | 2 | 3;
  /** Provider posts playback progress we can parse (drives resume/mini-player). */
  progress: boolean;
  build(a: BuildArgs): string;
}

/* ------------------------------ URL builders ------------------------------ */

function vidlinkUrl({ type, id, season, episode }: BuildArgs): string {
  const params = new URLSearchParams({ primaryColor: ACCENT_HEX });
  if (type === "tv") {
    params.set("autoplayNextEpisode", "true");
    params.set("episodeSelector", "true");
    return `https://vidlink.pro/tv/${id}/${season ?? 1}/${episode ?? 1}?${params.toString()}`;
  }
  return `https://vidlink.pro/movie/${id}?${params.toString()}`;
}

function vidfastUrl({ type, id, season, episode }: BuildArgs): string {
  // vidfast.pro 301s to vidfast.vc — keep the canonical origin, the redirect
  // resolves transparently inside the iframe.
  if (type === "tv") {
    return `https://vidfast.pro/tv/${id}/${season ?? 1}/${episode ?? 1}?autoPlay=true&autoNext=true`;
  }
  return `https://vidfast.pro/movie/${id}?autoPlay=true`;
}

function vidsrcUrl({ type, id, season, episode }: BuildArgs): string {
  return type === "tv"
    ? `https://vidsrc.to/embed/tv/${id}/${season ?? 1}/${episode ?? 1}`
    : `https://vidsrc.to/embed/movie/${id}`;
}

function twoEmbedUrl({ type, id, season, episode }: BuildArgs): string {
  // 2Embed's TV path takes the season/episode as query junk on embedtv.
  return type === "tv"
    ? `https://www.2embed.cc/embedtv/${id}&s=${season ?? 1}&e=${episode ?? 1}`
    : `https://www.2embed.cc/embed/${id}`;
}

/* ------------------------------ the catalogue ----------------------------- */

export const STREAM_SERVERS: readonly StreamServer[] = [
  {
    id: "vidlink",
    name: "VidLink",
    host: "vidlink.pro",
    blurb: "Clean player · fewest ads · saves progress",
    adLoad: 1,
    progress: true,
    build: vidlinkUrl,
  },
  {
    id: "vidfast",
    name: "VidFast",
    host: "vidfast.pro",
    blurb: "Slick autoplay player · minimal ads",
    adLoad: 1,
    progress: false,
    build: vidfastUrl,
  },
  {
    id: "vidsrc",
    name: "VidSrc",
    host: "vidsrc.to",
    blurb: "Reliable classic · widest coverage",
    adLoad: 2,
    progress: false,
    build: vidsrcUrl,
  },
  {
    id: "2embed",
    name: "2Embed",
    host: "2embed.cc",
    blurb: "Backup option · heavier ad load",
    adLoad: 3,
    progress: false,
    build: twoEmbedUrl,
  },
] as const;

/** Server picked when the user hasn't chosen (or their choice vanished). */
export const DEFAULT_SERVER: ServerId = "vidlink";

export function serverById(id: string | null | undefined): StreamServer {
  return STREAM_SERVERS.find((s) => s.id === id) ?? STREAM_SERVERS[0];
}

/** Build the iframe URL for a given server (falls back to the default). */
export function playerUrl(args: BuildArgs, serverId?: string | null): string {
  return serverById(serverId).build(args);
}

/* --------------------------- progress postMessage -------------------------- */
/* Providers speak different progress dialects; parse them all into one shape
 * so resume %, the mini-player card and history stats keep working no matter
 * which server the user picked. Returns null for unknown/unrelated messages. */

export interface ParsedProgress {
  /** Seconds into the title. */
  timestamp: number;
  /** Total length in seconds (> 0). */
  duration: number;
}

export function parseProgressMessage(data: unknown): ParsedProgress | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;

  // VidLink dialect: { type: "MEDIA_DATA", data: { currentTime, duration, … } }
  if (d.type === "MEDIA_DATA" && d.data && typeof d.data === "object") {
    const p = d.data as Record<string, unknown>;
    const timestamp = Number(p.currentTime);
    const duration = Number(p.duration);
    if (Number.isFinite(timestamp) && Number.isFinite(duration) && duration > 0 && timestamp >= 0) {
      return { timestamp, duration };
    }
    return null;
  }

  // Legacy generic dialect (kept for any provider that mimics the old
  // single-source shape): { type: "movie"|"tv"|"anime", timestamp, duration, … }
  if (
    (d.type === "movie" || d.type === "tv" || d.type === "anime") &&
    typeof d.duration === "number" &&
    d.duration > 0 &&
    typeof d.timestamp === "number" &&
    d.timestamp >= 0
  ) {
    return { timestamp: d.timestamp, duration: d.duration };
  }

  return null;
}
