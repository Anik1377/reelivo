/**
 * Playback sources — swappable by design.
 *
 * Primary: Videasy (https://www.videasy.to/docs)
 *   movie: https://player.videasy.to/movie/{tmdbId}
 *   tv:    https://player.videasy.to/tv/{tmdbId}/{season}/{episode}
 *   params: color=RRGGBB · nextEpisode · autoplayNextEpisode · episodeSelector
 *           overlay · progress={seconds}
 *
 * NOTE (2025): Videasy's docs display a shutdown notice while endpoints still
 * respond. If playback dies, add an entry to SOURCES below and flip DEFAULT.
 */

export const ACCENT_HEX = "00a8e1"; // Reelivo electric cyan, no '#'

type BuildArgs = {
  type: "movie" | "tv";
  id: number;
  season?: number;
  episode?: number;
  resumeSeconds?: number;
};

const BASE = "https://player.videasy.to";

export function playerUrl({ type, id, season, episode, resumeSeconds }: BuildArgs): string {
  const params = new URLSearchParams({
    color: ACCENT_HEX,
    overlay: "true",
    episodeSelector: type === "tv" ? "true" : "false",
    nextEpisode: type === "tv" ? "true" : "false",
    autoplayNextEpisode: type === "tv" ? "true" : "false",
  });
  if (resumeSeconds && resumeSeconds > 30) {
    params.set("progress", String(Math.floor(resumeSeconds)));
  }
  const path =
    type === "movie"
      ? `movie/${id}`
      : `tv/${id}/${season ?? 1}/${episode ?? 1}`;
  return `${BASE}/${path}?${params.toString()}`;
}

/** Shape of the progress message the Videasy player posts to window. */
export interface PlayerProgressMessage {
  id?: number;
  type?: string;
  progress?: number;
  timestamp?: number;
  duration?: number;
  season?: number;
  episode?: number;
}

export function isProgressMessage(data: unknown): data is PlayerProgressMessage {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    (d.type === "movie" || d.type === "tv" || d.type === "anime") &&
    typeof d.duration === "number" &&
    d.duration > 0 &&
    typeof d.timestamp === "number"
  );
}
