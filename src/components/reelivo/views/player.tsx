"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  Play,
  SendHorizonal,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";
import { hrefFor, navigate, useDetailStaleTime, useTmdb } from "@/lib/hooks";
import {
  DEFAULT_SERVER,
  parseProgressMessage,
  playerUrl,
  serverById,
  STREAM_SERVERS,
  type ServerId,
} from "@/lib/player";
import { progressKey, useReelivo, type SavedItem } from "@/lib/store";
import { poster, runtime as fmtRuntime, score, still, titleOf, yearOf } from "@/lib/format";
import type { MovieDetail, Paged, MediaItem, TvDetail, TvSeason } from "@/lib/tmdb-types";
import { Img, LostLink, usePrefersReducedMotion } from "../bits";
import { toSavedItem } from "../media";
import { AdBreakGate } from "../ad-break";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type Detail = MovieDetail | TvDetail;

/** Dot colours for the ad-load indicator — more dots = heavier ad load. */
const AD_LOAD_DOT: Record<1 | 2 | 3, string> = {
  1: "bg-emerald-400",
  2: "bg-amber-400",
  3: "bg-rose-400",
};

function labelOf(d: Detail): string {
  return "title" in d ? d.title : d.name;
}

export function PlayerView({
  type,
  id,
  season,
  episode,
}: {
  type: "movie" | "tv";
  id: number;
  season?: number;
  episode?: number;
}) {
  const stale = useDetailStaleTime();
  const detail = useTmdb<Detail>(id ? `${type}/${id}` : null, {}, stale);

  const s = season ?? 1;
  const e = episode ?? 1;
  const saveProgress = useReelivo((g) => g.saveProgress);
  const setLastEpisode = useReelivo((g) => g.setLastEpisode);
  const pushRecent = useReelivo((g) => g.pushRecent);
  const logHistory = useReelivo((g) => g.logHistory);
  const setMiniStream = useReelivo((g) => g.setMiniStream);

  // remember where a series was left, regardless of entry point
  useEffect(() => {
    if (type === "tv") setLastEpisode(id, s, e);
  }, [type, id, s, e]);

  // journal entry once we know the title — recents feed the hero rail,
  // history is the per-profile playback ledger (progress messages keep it fresh)
  useEffect(() => {
    if (detail.data) {
      const d = detail.data;
      const item: SavedItem = {
        ...toSavedItem(d as unknown as import("@/lib/tmdb-types").MediaItem, type),
        title: labelOf(d),
      };
      pushRecent(item);
      const prior = useReelivo.getState().getProgress(id, type, s, e);
      logHistory(
        {
          ...item,
          season: type === "tv" ? s : undefined,
          episode: type === "tv" ? e : undefined,
        },
        prior && prior.duration > 0 ? prior.timestamp / prior.duration : 0
      );
    }
  }, [detail.data?.id, type]);

  // page title
  useEffect(() => {
    if (detail.data) {
      document.title = `Playing ${labelOf(detail.data)}${
        type === "tv" ? ` S${s} E${e}` : ""
      } — Reelivo`;
    }
    return () => {
      document.title = "Reelivo — what to watch tonight";
    };
  }, [detail.data, type, s, e]);

  /* --------------------------- playback server --------------------------- */
  /* Device-level preference (persists across profiles); null = engine default.
   * Switching servers remounts the frame — instant one-click failover when a
   * provider is down, with our progress tracking continuing throughout. */
  const streamServer = useReelivo((g) => g.streamServer);
  const setStreamServer = useReelivo((g) => g.setStreamServer);
  const serverId: ServerId =
    (STREAM_SERVERS.find((sv) => sv.id === streamServer)?.id ?? DEFAULT_SERVER) as ServerId;
  const activeServer = serverById(serverId);
  const serverIdx = STREAM_SERVERS.findIndex((sv) => sv.id === serverId);
  const nextServer = STREAM_SERVERS[(serverIdx + 1) % STREAM_SERVERS.length];

  const iframeSrc = useMemo(
    () => playerUrl({ type, id, season: s, episode: e }, serverId),
    [type, id, s, e, serverId]
  );

  /* Stuck-frame detector: cross-origin iframes always fire onLoad once the
   * document responds — a dead/blocked provider never does. If nothing has
   * loaded ~14s in, surface an honest one-click failover hint. Both flags are
   * keyed to iframeSrc so navigating to another episode/server resets them
   * without any state-reset effects. (iframeSrc is declared BEFORE this block
   * — the first commit referenced it here before initialization and the whole
   * player crashed with a TDZ ReferenceError.) */
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [stuckSrc, setStuckSrc] = useState<string | null>(null);
  const frameIsLoaded = loadedSrc === iframeSrc;
  const frameIsStuck = stuckSrc === iframeSrc;
  useEffect(() => {
    if (frameIsLoaded) return;
    const t = setTimeout(() => setStuckSrc(iframeSrc), 14000);
    return () => clearTimeout(t);
  }, [iframeSrc, frameIsLoaded]);

  const switchServer = (id: ServerId) => {
    if (id === serverId) return;
    setStreamServer(id);
    toast(`Switched to ${serverById(id).name}`, {
      description: serverById(id).blurb,
    });
  };

  /* ------------------------- progress + mini-stream ------------------------ */
  /* Every progress postMessage (VidLink's MEDIA_DATA dialect or the legacy
   * generic provider shape — see parseProgressMessage) feeds two throttled
   * consumers:
   * the per-profile progress store (~8s, as before) and the device-level
   * mini-stream card (~5s, "keep watching" from anywhere). pct is computed
   * the same way saveProgress does — progress/duration, guarded against
   * 0/NaN (setMiniStream clamps 0..1 again). Servers that post nothing
   * (VidFast/VidSrc/2Embed) simply skip this — the picker says so. */
  const lastSave = useRef(0);
  const lastMini = useRef(0);
  /** Latest progress message, captured UNthrottled — flushed to the mini
   * card on unmount in case the final messages were throttle-skipped. */
  const lastSeen = useRef<{
    type: "movie" | "tv";
    id: number;
    season?: number;
    episode?: number;
    title: string;
    still: string | null;
    ts: number;
    dur: number;
  } | null>(null);
  /** Current TV episode's still path — kept in a ref so the message listener
   * doesn't have to re-subscribe on every season fetch. */
  const episodeStillRef = useRef<string | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const msg = parseProgressMessage(event.data);
      if (!msg) return;
      const now = Date.now();
      if (detail.data) {
        const d = detail.data;
        const dur = msg.duration;
        const ts = msg.timestamp;
        const stillUrl = still(
          (type === "tv" ? episodeStillRef.current : null) ?? d.backdrop_path,
          "w780"
        );
        const seen = {
          type,
          id,
          season: type === "tv" ? s : undefined,
          episode: type === "tv" ? e : undefined,
          title: labelOf(d),
          still: stillUrl,
          ts,
          dur,
        };
        lastSeen.current = seen;
        if (now - lastMini.current >= 5000) {
          lastMini.current = now;
          setMiniStream({
            type: seen.type,
            id: seen.id,
            season: seen.season,
            episode: seen.episode,
            title: seen.title,
            still: seen.still,
            pct: seen.dur > 0 && Number.isFinite(seen.dur) && Number.isFinite(seen.ts) ? seen.ts / seen.dur : 0,
            updatedAt: now,
          });
        }
      }
      if (now - lastSave.current < 8000) return; // throttle
      lastSave.current = now;
      if (detail.data) {
        const d = detail.data;
        saveProgress({
          id,
          type,
          title: labelOf(d),
          poster: d.poster_path ?? null,
          backdrop: d.backdrop_path ?? null,
          year: yearOf(d),
          rating: d.vote_average ?? 0,
          addedAt: Date.now(),
          season: type === "tv" ? s : undefined,
          episode: type === "tv" ? e : undefined,
          episodeName: undefined,
          timestamp: msg.timestamp,
          duration: msg.duration,
        });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [detail.data, id, type, s, e, saveProgress, setMiniStream]);

  /* Navigating away mid-playback: make sure the mini card carries the LAST
   * known position even when the final progress messages were throttle-skipped.
   * Cleanup-only and ref-based (rules-of-hooks safe), and deliberately does
   * NOT clear miniStream — the card appearing after you leave is the point. */
  useEffect(() => {
    return () => {
      const seen = lastSeen.current;
      if (!seen) return;
      setMiniStream({
        type: seen.type,
        id: seen.id,
        season: seen.season,
        episode: seen.episode,
        title: seen.title,
        still: seen.still,
        pct: seen.dur > 0 && Number.isFinite(seen.dur) ? seen.ts / seen.dur : 0,
        updatedAt: Date.now(),
      });
    };
  }, [setMiniStream]);

  const backHref = hrefFor({ name: "detail", type, id });

  /* ------------------------- pre-roll ad break ------------------------- */
  /* AdBreakGate (keyed per title/season/episode) overlays the frame while the
   * stream preloads underneath; the cap lives in lib/ads.ts and kids profiles
   * never see it. */
  const kidsActive = useReelivo(
    (g) => g.profiles.find((p) => p.id === g.activeProfileId)?.kids ?? false
  );
  const adGateKey = `${type}-${id}-${s}-${e}`;

  /* ------------------------------ watch party ------------------------------ */
  /* Kids profiles never get the Watch party affordance: rooms carry open chat
   * with strangers, and that surface stays adult-only by design. */
  const myName = useReelivo(
    (g) => g.profiles.find((p) => p.id === g.activeProfileId)?.name?.trim() || "Guest"
  );
  const [partyOpen, setPartyOpen] = useState(false);
  const party = useWatchParty(partyOpen && !kidsActive, myName);
  const reduceMotion = usePrefersReducedMotion();
  const closeParty = (next: boolean) => {
    setPartyOpen(next);
    if (!next) party.leaveParty(); // closing the panel leaves the room
  };

  // Esc returns to the title page — but not while the party sheet owns Esc.
  // CAPTURE phase: window capture runs BEFORE the sheet's document-level
  // escape handler, so partyOpenRef still reflects "sheet open" for THIS
  // keypress (a bubble-phase listener ran after Radix had already closed the
  // panel and the ref had flipped, so one Escape both closed AND navigated).
  const partyOpenRef = useRef(partyOpen);
  useEffect(() => {
    partyOpenRef.current = partyOpen;
  }, [partyOpen]);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && !partyOpenRef.current) navigate(backHref);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [backHref]);

  const title = detail.data ? labelOf(detail.data) : "Loading…";
  const tv = type === "tv" ? (detail.data as TvDetail | undefined) : undefined;
  const currentSeason = tv?.seasons?.find((x) => x.season_number === s);
  const progressEntry = useReelivo((g) => g.progress[progressKey(id, type, s, e)]);

  /* ------------------------- up next / keep watching ------------------------ */
  const seasonQ = useTmdb<TvSeason>(type === "tv" && id ? `tv/${id}/season/${s}` : null, {}, stale);
  const recsQ = useTmdb<Paged<MediaItem>>(id ? `${type}/${id}/recommendations` : null);

  const episodes = seasonQ.data?.episodes ?? [];
  const nextInSeason = useMemo(() => {
    const idx = episodes.findIndex((ep) => ep.episode_number === e);
    return idx >= 0 ? (episodes[idx + 1] ?? null) : null;
  }, [episodes, e]);
  const nextSeason = useMemo(() => {
    if (nextInSeason) return null;
    return (
      (tv?.seasons ?? [])
        .filter((x) => x.episode_count > 0 && x.season_number > s)
        .sort((a, b) => a.season_number - b.season_number)[0] ?? null
    );
  }, [nextInSeason, tv, s]);

  // warm the next episodes' stills so a click on Up next renders instantly
  useEffect(() => {
    if (episodes.length === 0) return;
    const idx = episodes.findIndex((ep) => ep.episode_number === e);
    for (const ep of episodes.slice(idx + 1, idx + 4)) {
      const src = still(ep.still_path, "w300");
      if (src) {
        const img = new Image();
        img.src = src;
      }
    }
  }, [episodes, e]);

  // keep the mini-stream trigger's episode-still ref current
  const episodeStill =
    type === "tv"
      ? (episodes.find((ep) => ep.episode_number === e)?.still_path ?? null)
      : null;
  useEffect(() => {
    episodeStillRef.current = episodeStill;
  }, [episodeStill]);

  const recItems = useMemo(
    () =>
      (recsQ.data?.results ?? [])
        .filter((i) => !i.adult && (i.backdrop_path || i.poster_path))
        .slice(0, 8),
    [recsQ.data]
  );

  /* Truncated/junk play links parse to id 0 — designed dead-end, idle queries. */
  if (!id) return <LostLink />;

  return (
    <div className="flex min-h-screen flex-col bg-black">
      <header className="flex items-center justify-between gap-3 px-4 py-3 md:px-8">
        <button
          type="button"
          onClick={() => navigate(backHref)}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-white/10 px-3.5 text-sm text-white transition-all duration-150 hover:bg-white/20 active:scale-95"
          aria-label="Back to title page"
        >
          <ChevronLeft className="size-4" aria-hidden />
          <span className="display text-[15px] tracking-tight">
            reelivo<span className="text-primary">.</span>
          </span>
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-semibold text-white/95">{title}</p>
            <p className="truncate text-xs text-white/45">
              {type === "tv"
                ? `Season ${s} · Episode ${e}${
                    currentSeason?.name && !/^season\s*\d+$/i.test(currentSeason.name)
                      ? ` — ${currentSeason.name}`
                      : ""
                  }`
                : detail.data
                  ? `${yearOf(detail.data)}${
                      "runtime" in detail.data && detail.data.runtime
                        ? ` · ${fmtRuntime(detail.data.runtime)}`
                        : ""
                    }`
                  : ""}
              {detail.data ? ` · ${score(detail.data.vote_average)}` : ""}
            </p>
          </div>
          {!kidsActive && (
            <button
              type="button"
              onClick={() => setPartyOpen(true)}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm font-semibold text-white transition-all duration-150 hover:bg-white/20 active:scale-95"
              aria-label="Watch party"
            >
              <Users className="size-4 text-primary" aria-hidden />
              <span className="hidden sm:inline">Watch party</span>
              <span className="sm:hidden">Party</span>
            </button>
          )}
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 pb-8 md:px-8">
        <div className="w-full max-w-6xl">
          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-surface ring-1 ring-white/10">
            {detail.isPending ? (
              <div className="grid h-full w-full place-items-center" aria-busy>
                <span className="inline-flex items-center gap-2 text-sm text-ink-dim">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Loading stream…
                </span>
              </div>
            ) : (
              <>
                <iframe
                  key={iframeSrc}
                  src={iframeSrc}
                  title={`${title} — free stream${type === "tv" ? `, S${s} E${e}` : ""}`}
                  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                  allowFullScreen
                  referrerPolicy="origin"
                  onLoad={() => setLoadedSrc(iframeSrc)}
                  className="h-full w-full border-0"
                />
                {/* preloads underneath the break; never on kids profiles */}
                {!kidsActive && (
                  <AdBreakGate key={adGateKey} onExit={() => navigate(backHref)} />
                )}
              </>
            )}
            {/* roll-call countdown — sits above the ad gate, below nothing */}
            {!detail.isPending && (
              <CountdownOverlay state={party.countdown} reduced={reduceMotion} />
            )}
          </div>

          {/* stuck? honest failover hint — only while the frame never loaded */}
          {frameIsStuck && !frameIsLoaded && (
            <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 text-[13px] text-amber-100/90">
              <TriangleAlert className="size-4 shrink-0 text-amber-300" aria-hidden />
              <p className="min-w-0 flex-1 leading-relaxed">
                Still connecting…{" "}
                <span className="font-semibold text-white">{activeServer.name}</span> may be
                down or blocked. Switching servers takes one click.
              </p>
              <button
                type="button"
                onClick={() => switchServer(nextServer.id)}
                className="shrink-0 rounded-lg bg-amber-300/90 px-3 py-1.5 text-xs font-semibold text-black transition-all duration-150 hover:bg-amber-300 active:scale-95"
              >
                Try {nextServer.name}
              </button>
            </div>
          )}

          {/* server picker — ordered fewest-ads first, dots = ad load */}
          <section aria-label="Stream servers" className="mt-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="kicker text-white/40">Servers</p>
              <p className="truncate text-[11px] text-white/35">
                {activeServer.progress
                  ? "progress tracked automatically here"
                  : "no progress tracking — VidLink has it"}
              </p>
            </div>
            <div
              className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1"
              role="group"
              aria-label="Choose a playback server"
            >
              {STREAM_SERVERS.map((sv) => {
                const activeSv = sv.id === serverId;
                return (
                  <button
                    key={sv.id}
                    type="button"
                    onClick={() => switchServer(sv.id)}
                    aria-pressed={activeSv}
                    aria-label={`${sv.name} — ${sv.blurb}`}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] transition-all duration-150 active:scale-[0.97] ${
                      activeSv
                        ? "border-primary/70 bg-primary/15 font-semibold text-white ring-1 ring-primary/30"
                        : "border-white/10 bg-white/[0.04] text-white/65 hover:border-white/25 hover:text-white"
                    }`}
                  >
                    {sv.id === DEFAULT_SERVER && !streamServer && (
                      <Sparkles
                        className={`size-3.5 ${activeSv ? "text-primary" : "text-primary/70"}`}
                        aria-hidden
                      />
                    )}
                    <span>{sv.name}</span>
                    <span className="flex items-center gap-0.5" aria-hidden>
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className={`size-1.5 rounded-full ${
                            i < sv.adLoad ? AD_LOAD_DOT[sv.adLoad] : "bg-white/15"
                          }`}
                        />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/35">
              <span className="text-white/55">
                {activeServer.name} · {activeServer.host}
              </span>{" "}
              — {activeServer.blurb}. Dots = ad load; fewer is better.
            </p>
          </section>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-white/40">
            <p>
              Free · ad-supported streams from independent providers. If one misbehaves, the
              picker above is your friend.
            </p>
            {progressEntry && progressEntry.duration > 0 && (
              <p className="tabular text-primary/80">
                {Math.round((progressEntry.timestamp / progressEntry.duration) * 100)}% watched
              </p>
            )}
          </div>

          {/* Up next — TV */}
          {type === "tv" && (nextInSeason || nextSeason) && (
            <section aria-label="Up next" className="mt-6">
              <p className="kicker mb-2 text-white/40">Up next</p>
              {nextInSeason ? (
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      hrefFor({
                        name: "play",
                        type: "tv",
                        id,
                        season: s,
                        episode: nextInSeason.episode_number,
                      })
                    )
                  }
                  className="group flex w-full items-center gap-4 rounded-xl border border-white/[0.06] bg-surface p-3 text-left transition-colors duration-150 hover:border-white/20 hover:bg-surface-2"
                >
                  <span className="relative w-[152px] shrink-0 overflow-hidden rounded-lg bg-surface-2">
                    <Img
                      src={still(nextInSeason.still_path, "w300")}
                      alt=""
                      fallbackTitle={nextInSeason.name}
                      className="aspect-video w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
                    />
                    <span className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                      <span className="grid size-9 place-items-center rounded-full bg-white text-black">
                        <Play className="ml-0.5 size-4 fill-current" aria-hidden />
                      </span>
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-primary">
                      S{s} E{nextInSeason.episode_number}
                    </span>
                    <span className="mt-0.5 block truncate text-[15px] font-semibold text-white">
                      {nextInSeason.name}
                    </span>
                    {nextInSeason.overview && (
                      <span className="mt-1 line-clamp-2 hidden text-xs leading-relaxed text-white/50 sm:block">
                        {nextInSeason.overview}
                      </span>
                    )}
                  </span>
                  <ChevronRight
                    className="size-5 shrink-0 text-white/30 transition-colors duration-150 group-hover:text-primary"
                    aria-hidden
                  />
                </button>
              ) : nextSeason ? (
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      hrefFor({
                        name: "play",
                        type: "tv",
                        id,
                        season: nextSeason.season_number,
                        episode: 1,
                      })
                    )
                  }
                  className="group flex w-full items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-surface px-4 py-3.5 text-left transition-colors duration-150 hover:border-white/20 hover:bg-surface-2"
                >
                  <span>
                    <span className="block text-[15px] font-semibold text-white">
                      {nextSeason.season_number === 0 ? "Specials" : `Season ${nextSeason.season_number}`}
                    </span>
                    <span className="mt-0.5 block text-xs text-white/50">
                      {nextSeason.episode_count} episodes — start from the beginning
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-150 group-hover:bg-primary group-hover:text-primary-foreground">
                    Next season
                    <ChevronRight className="size-3.5" aria-hidden />
                  </span>
                </button>
              ) : null}
            </section>
          )}

          {/* Keep watching — more like this, films & series */}
          {recItems.length > 0 && (
            <section aria-label="More like this" className="mt-6">
              <p className="kicker mb-2 text-white/40">More like this</p>
              <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
                {recItems.map((m) => (
                  <a
                    key={m.id}
                    href={hrefFor({ name: "detail", type, id: m.id })}
                    className="group w-[132px] shrink-0 snap-start"
                    aria-label={`${titleOf(m)} — details`}
                  >
                    <span className="block overflow-hidden rounded-lg bg-surface-2 ring-1 ring-white/[0.06] transition-all duration-200 group-hover:ring-white/25">
                      <Img
                        src={poster(m.poster_path, "w185") ?? still(m.backdrop_path, "w300")}
                        alt=""
                        fallbackTitle={titleOf(m)}
                        className="aspect-[2/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
                      />
                    </span>
                    <span className="mt-1.5 block truncate text-xs font-medium text-white/70 transition-colors group-hover:text-white">
                      {titleOf(m)}
                    </span>
                    <span className="block text-[11px] text-white/35">{yearOf(m)}</span>
                  </a>
                ))}
              </div>
            </section>
          )}

          {type === "tv" && tv?.seasons && tv.seasons.length > 1 && (
            <nav aria-label="Seasons" className="mt-5">
              <p className="kicker mb-2 text-white/40">Jump to season</p>
              <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                {tv.seasons
                  .filter((x) => x.episode_count > 0)
                  .map((x) => (
                    <button
                      key={x.id}
                      type="button"
                      onClick={() =>
                        navigate(hrefFor({ name: "play", type: "tv", id, season: x.season_number, episode: 1 }))
                      }
                      aria-current={x.season_number === s ? "true" : undefined}
                      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
                        x.season_number === s
                          ? "border-primary bg-primary text-primary-foreground font-semibold"
                          : "border-white/10 bg-white/[0.04] text-white/60 hover:border-white/25 hover:text-white"
                      }`}
                    >
                      {x.season_number === 0 ? "Specials" : `S${x.season_number}`}
                    </button>
                  ))}
              </div>
            </nav>
          )}
        </div>
      </main>

      {!kidsActive && (
        <PartySheet
          open={partyOpen}
          onOpenChange={closeParty}
          playingTitle={detail.data ? labelOf(detail.data) : undefined}
          myName={myName}
          connected={party.connected}
          failed={party.failed}
          room={party.room}
          members={party.members}
          messages={party.messages}
          isHost={party.isHost}
          mySid={party.mySid}
          onCreate={party.createRoom}
          onJoin={party.joinRoom}
          onSend={party.sendChat}
          onRollCall={party.rollCall}
        />
      )}
    </div>
  );
}

/* ============================== watch party =============================== */
/* Watch parties ride the tiny socket.io mini-service in mini-services/party-
 * service (port 3003 via the gateway's XTransformPort forward — the repo's
 * websocket-client convention: no port in the URL, query picks the backend).
 * The sync is HONEST by design: the host's roll call lands a 3-2-1 overlay on
 * every member so the group presses play together — playback itself is NOT
 * frame-synced (the panel says so). */

interface PartyChatMessage {
  from: string; // display name; "" = local/system line
  text: string;
  at: number;
  /** Sender socket id (server-added) — lets a client right-align its own
   * bubbles even when two members share a display name. */
  sid?: string;
}

type PartyJoinAck =
  | { ok: true; members: string[]; messages: PartyChatMessage[]; host: boolean }
  | { ok: false; error: "not-found" | "room-full" };

const PARTY_SERVER = "/?XTransformPort=3003"; // Caddy → localhost:3003
const PARTY_MSG_CAP = 50; // mirrors the server's history cap
const PARTY_CHAT_CAP = 280; // mirrors the server's per-message cap
const PARTY_COUNTDOWN_MS = 3000;

function pushSystemLine(list: PartyChatMessage[], text: string): PartyChatMessage[] {
  const next = [...list, { from: "", text, at: Date.now() }];
  return next.length > PARTY_MSG_CAP ? next.slice(next.length - PARTY_MSG_CAP) : next;
}

function useWatchParty(open: boolean, myName: string) {
  const [connected, setConnected] = useState(false);
  /** True when the realtime service is unreachable (e.g. serverless hosting
   * like Vercel, which can't run the socket mini-service). Drives the panel's
   * honest "unavailable" note instead of an eternal "Connecting…". */
  const [failed, setFailed] = useState(false);
  const [room, setRoom] = useState<string | null>(null);
  const [members, setMembers] = useState<string[]>([]);
  const [messages, setMessages] = useState<PartyChatMessage[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null); // 3/2/1, 0 = "Play!"
  const [mySid, setMySid] = useState("");

  const socketRef = useRef<Socket | null>(null);
  const roomRef = useRef<string | null>(null);
  const nameRef = useRef(myName);
  const [startAt, setStartAt] = useState<number | null>(null);

  useEffect(() => {
    nameRef.current = myName;
  }, [myName]);

  /* Socket lifecycle — the connection exists only while the party panel is
   * open (leaving the panel leaves the party). */
  useEffect(() => {
    if (!open) return;
    const socket = io(PARTY_SERVER, {
      transports: ["websocket", "polling"],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000,
    });
    socketRef.current = socket;

    /* Honest failure signal: if the handshake hasn't landed within 8s the
     * service is effectively unreachable (serverless deployments can't run
     * it at all) — flip `failed` so the UI can say so. A late connect still
     * clears it (onConnect). */
    let settleTimer: number | undefined = window.setTimeout(() => {
      if (!socket.connected) setFailed(true);
    }, 8000);
    const onConnectError = () => setFailed(true);
    socket.on("connect_error", onConnectError);

    const onConnect = () => {
      setMySid(socket.id ?? "");
      setConnected(true);
      setFailed(false);
      // Reconnect-safe: rejoin the room and refetch history through the ack.
      const r = roomRef.current;
      if (r) {
        socket.emit("party:join", { room: r, name: nameRef.current }, (res: PartyJoinAck) => {
          if (res.ok) {
            setMembers(res.members);
            setMessages(res.messages);
            setIsHost(res.host);
          } else {
            // room expired or filled up while we were gone — reset honestly
            roomRef.current = null;
            setRoom(null);
            setMembers([]);
            setMessages([]);
            setIsHost(false);
            setCountdown(null);
            toast.error(
              res.error === "room-full" ? "The party is full (8 max)" : "The party has ended"
            );
          }
        });
      }
    };
    const onDisconnect = () => setConnected(false);
    const onJoined = (p: { name?: string }) => {
      if (p && typeof p.name === "string") {
        setMessages((prev) => pushSystemLine(prev, `${p.name} joined`));
      }
    };
    const onChat = (m: PartyChatMessage) => {
      if (!m || typeof m.text !== "string") return;
      setMessages((prev) => {
        const next = [...prev, m];
        return next.length > PARTY_MSG_CAP ? next.slice(next.length - PARTY_MSG_CAP) : next;
      });
    };
    const onStart = (p: { at?: number }) => {
      if (p && typeof p.at === "number" && Number.isFinite(p.at)) setStartAt(p.at);
    };
    const onPresence = (p: { count?: number; names?: string[] }) => {
      if (p && Array.isArray(p.names)) setMembers(p.names);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("party:joined", onJoined);
    socket.on("party:chat", onChat);
    socket.on("party:start", onStart);
    socket.on("party:presence", onPresence);
    if (socket.connected) onConnect(); // pooled connection already open

    return () => {
      if (settleTimer !== undefined) window.clearTimeout(settleTimer);
      socket.emit("party:leave");
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
      setFailed(false); // fresh probe next time the panel opens
      setStartAt(null);
      setCountdown(null);
    };
  }, [open]);

  /* Roll-call ticker: numerals 3-2-1, then a 2.2s "Play!" hint, then off.
   * Ticks run inside timers (never synchronously in the effect body) so no
   * cascading-render setState happens during the commit itself. */
  useEffect(() => {
    if (startAt == null) return;
    let playTimer: number | undefined;
    let iv: number | undefined;
    const finish = () => {
      setCountdown(null);
      setStartAt(null);
    };
    const tick = (): boolean => {
      const left = Math.ceil((startAt - Date.now()) / 1000);
      if (left > 0) {
        setCountdown(left);
        return true;
      }
      setCountdown(0);
      playTimer = window.setTimeout(finish, 2200);
      return false;
    };
    const first = window.setTimeout(tick, 0);
    iv = window.setInterval(() => {
      if (!tick() && iv !== undefined) window.clearInterval(iv);
    }, 200);
    return () => {
      window.clearTimeout(first);
      if (iv !== undefined) window.clearInterval(iv);
      if (playTimer !== undefined) window.clearTimeout(playTimer);
    };
  }, [startAt]);

  const applyJoin = (res: PartyJoinAck, code: string) => {
    if (res.ok) {
      roomRef.current = code;
      setRoom(code);
      setMembers(res.members);
      setMessages(res.messages.slice(-PARTY_MSG_CAP));
      setIsHost(res.host);
      toast.success(res.host ? "You're hosting — share the code" : `Joined party ${code}`);
    } else if (res.error === "room-full") {
      toast.error("That party is full (8 max)");
    } else {
      toast.error("No party with that code");
    }
  };

  const createRoom = () => {
    const socket = socketRef.current;
    if (!socket || !connected) return;
    socket.emit("party:create", (res: { room?: string }) => {
      if (!res?.room) {
        toast.error("Couldn't start the party");
        return;
      }
      socket.emit("party:join", { room: res.room, name: nameRef.current }, (j: PartyJoinAck) =>
        applyJoin(j, res.room as string)
      );
    });
  };

  const joinRoom = (code: string) => {
    const socket = socketRef.current;
    if (!socket || !connected) return;
    const clean = code.trim().toUpperCase();
    socket.emit("party:join", { room: clean, name: nameRef.current }, (j: PartyJoinAck) =>
      applyJoin(j, clean)
    );
  };

  const sendChat = (text: string) => {
    const socket = socketRef.current;
    const r = roomRef.current;
    const clean = text.trim().slice(0, PARTY_CHAT_CAP);
    if (!socket || !r || !clean) return;
    socket.emit("party:chat", { room: r, text: clean });
  };

  const rollCall = () => {
    const socket = socketRef.current;
    const r = roomRef.current;
    if (!socket || !r || !isHost) return;
    socket.emit("party:start", { room: r, at: Date.now() + PARTY_COUNTDOWN_MS });
    // the room broadcast (including us) drives the overlay
  };

  /** Leave the room and clear party state — panel close, or unmount. */
  const leaveParty = () => {
    const socket = socketRef.current;
    const r = roomRef.current;
    if (socket && r) socket.emit("party:leave");
    roomRef.current = null;
    setRoom(null);
    setMembers([]);
    setMessages([]);
    setIsHost(false);
    setStartAt(null);
  };

  return {
    connected,
    failed,
    room,
    members,
    messages,
    isHost,
    countdown,
    mySid,
    createRoom,
    joinRoom,
    sendChat,
    rollCall,
    leaveParty,
  };
}

/* Small round initials dot — presence row + chat author marks. */
function InitialDot({ name, self, small }: { name: string; self?: boolean; small?: boolean }) {
  const initial = (name.trim()[0] || "?").toUpperCase();
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full font-bold ${
        small ? "size-7 text-[11px]" : "size-8 text-xs"
      } ${self ? "bg-primary text-black" : "bg-white/10 text-white/80"}`}
    >
      {initial}
    </span>
  );
}

/* Full-player roll-call overlay. state: 3/2/1 numerals, 0 = "Play!" hint
 * (non-blocking so people can actually reach play), null = off. */
function CountdownOverlay({ state, reduced }: { state: number | null; reduced: boolean }) {
  if (state === null) return null;
  const pop = reduced ? "" : "animate-in fade-in zoom-in duration-200";
  return (
    <div
      role="status"
      aria-live="assertive"
      className={`absolute inset-0 z-[60] grid place-items-center bg-black/85 text-center backdrop-blur-sm ${
        state === 0 ? "pointer-events-none" : ""
      }`}
    >
      {state > 0 ? (
        <div key={state} className={pop}>
          <p className="kicker text-primary">Roll call</p>
          {reduced ? (
            <p className="display mt-2 px-6 text-3xl font-extrabold text-white">
              Press play now
            </p>
          ) : (
            <p className="display tabular mt-2 text-[96px] font-extrabold leading-none text-white">
              {state}
            </p>
          )}
          <p className="mt-3 text-sm text-white/60">Get ready to press play</p>
        </div>
      ) : (
        <div className={pop}>
          <p className="display text-5xl font-extrabold text-primary">Play!</p>
          <p className="mt-3 text-sm text-white/60">Everyone presses play now</p>
        </div>
      )}
    </div>
  );
}

function PartySheet({
  open,
  onOpenChange,
  playingTitle,
  myName,
  connected,
  failed,
  room,
  members,
  messages,
  isHost,
  mySid,
  onCreate,
  onJoin,
  onSend,
  onRollCall,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playingTitle?: string;
  myName: string;
  connected: boolean;
  failed: boolean;
  room: string | null;
  members: string[];
  messages: PartyChatMessage[];
  isHost: boolean;
  mySid: string;
  onCreate: () => void;
  onJoin: (code: string) => void;
  onSend: (text: string) => void;
  onRollCall: () => void;
}) {
  const [code, setCode] = useState("");
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // chat follows the newest message
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, room]);

  const submitChat = (ev: FormEvent) => {
    ev.preventDefault();
    if (!draft.trim()) return;
    onSend(draft);
    setDraft("");
  };

  const submitCode = (ev: FormEvent) => {
    ev.preventDefault();
    if (/^[A-Z0-9]{6}$/.test(code.trim().toUpperCase())) onJoin(code);
  };

  /* clipboard needs a secure context; execCommand covers the rest
   * (same fallback shape as detail's share) */
  const copyCode = async () => {
    if (!room) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(room);
      } else {
        const ta = document.createElement("textarea");
        ta.value = room;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      toast.success("Room code copied");
    } catch {
      toast.error("Couldn't copy the code");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 border-white/10 bg-popover p-0 sm:max-w-[380px]"
      >
        <SheetHeader className="border-b border-white/10 px-5 pb-4 pt-5">
          <SheetTitle className="display flex items-center gap-2 text-lg text-foreground">
            <Users className="size-4.5 text-primary" aria-hidden />
            Watch party
          </SheetTitle>
          <SheetDescription className="text-xs">
            {playingTitle ? `Watching “${playingTitle}” together` : "Press play together"}
          </SheetDescription>
        </SheetHeader>

        {!room ? (
          /* ---------------------------- no room yet ---------------------------- */
          <div className="styled-scrollbar flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
            <p
              className={`text-xs ${connected ? "text-white/50" : failed ? "text-amber-200/90" : "text-white/40"}`}
              role="status"
            >
              {connected
                ? "Connected. Start a fresh room or jump into one with a code."
                : failed
                  ? "Couldn't reach the party service."
                  : "Connecting to the party service…"}
            </p>
            {failed && !connected && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-3.5 py-3 text-[12.5px] leading-relaxed text-amber-100/90">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden />
                <p>
                  Watch-party chat runs on a realtime service this deployment doesn&apos;t
                  include. Everything else — browsing, search, your list, playback — works
                  normally.
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={onCreate}
              disabled={!connected}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-bold text-black transition-all duration-150 hover:-translate-y-px hover:shadow-[0_10px_28px_rgba(0,168,225,0.35)] active:translate-y-0 disabled:pointer-events-none disabled:opacity-40"
            >
              <Users className="size-4" aria-hidden />
              Start a watch party
            </button>
            <div className="flex items-center gap-3" aria-hidden>
              <span className="h-px flex-1 bg-white/10" />
              <span className="text-[11px] uppercase tracking-widest text-white/30">or</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <form onSubmit={submitCode} className="flex flex-col gap-2.5">
              <label htmlFor="party-code" className="text-xs font-semibold text-white/60">
                Join with a code
              </label>
              <input
                id="party-code"
                value={code}
                onChange={(ev) =>
                  setCode(ev.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))
                }
                placeholder="ABC123"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={6}
                aria-label="Party code"
                className="display h-11 w-full rounded-lg border border-white/10 bg-surface px-3 text-center text-lg font-bold uppercase tracking-[0.35em] text-white placeholder:text-white/25 focus:border-primary/60 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!connected || !/^[A-Z0-9]{6}$/.test(code.trim())}
                className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] text-sm font-semibold text-white transition-colors duration-150 hover:border-white/30 hover:bg-white/10 disabled:pointer-events-none disabled:opacity-40"
              >
                Join party
              </button>
            </form>
            <p className="text-[11px] leading-relaxed text-white/40">
              Up to 8 people per room. Everyone gets the same countdown and chat — closing
              this panel leaves the party.
            </p>
          </div>
        ) : (
          /* ------------------------------ in a room ----------------------------- */
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-white/10 px-5 py-4">
              <p className="kicker text-white/40">Room code</p>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <p
                  className="display text-2xl font-extrabold tracking-[0.28em] text-primary"
                  aria-label={`Room code ${room}`}
                >
                  {room}
                </p>
                <button
                  type="button"
                  onClick={copyCode}
                  className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs font-semibold text-white transition-colors duration-150 hover:bg-white/20"
                >
                  <Copy className="size-3.5" aria-hidden />
                  Copy code
                </button>
              </div>
              <p className="mt-3 text-xs font-semibold text-white/60" role="status">
                {members.length} watching now
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {members.map((n, i) => (
                  <span key={`${n}-${i}`} className="flex items-center gap-1.5">
                    <InitialDot name={n} self={n === myName && members.indexOf(n) === i} />
                  </span>
                ))}
              </div>
            </div>

            <div
              ref={listRef}
              className="styled-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-5 py-4"
              aria-label="Party chat"
            >
              {messages.length === 0 && (
                <p className="mt-6 text-center text-xs text-white/35">
                  No messages yet — say hi.
                </p>
              )}
              {messages.map((m, i) => {
                if (m.from === "") {
                  return (
                    <p key={`sys-${i}`} className="text-center text-[11px] text-white/35">
                      {m.text}
                    </p>
                  );
                }
                const own = m.sid ? m.sid === mySid : m.from === myName;
                return own ? (
                  <div
                    key={`msg-${i}`}
                    className="max-w-[85%] self-end rounded-2xl rounded-br-md border border-primary/30 bg-primary/15 px-3 py-2"
                  >
                    <p className="break-words text-[13px] leading-snug text-white">{m.text}</p>
                    <p className="mt-0.5 text-right text-[10px] text-white/40">{m.from}</p>
                  </div>
                ) : (
                  <div key={`msg-${i}`} className="flex max-w-[85%] items-end gap-2 self-start">
                    <InitialDot name={m.from} small />
                    <div className="rounded-2xl rounded-bl-md bg-white/[0.06] px-3 py-2">
                      <p className="text-[11px] font-semibold text-white/50">{m.from}</p>
                      <p className="break-words text-[13px] leading-snug text-white">{m.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={submitChat} className="flex gap-2 border-t border-white/10 px-4 py-3">
              <input
                value={draft}
                onChange={(ev) => setDraft(ev.target.value)}
                maxLength={PARTY_CHAT_CAP}
                placeholder="Type a message…"
                aria-label="Chat message"
                className="h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-surface px-3 text-sm text-white placeholder:text-white/30 focus:border-primary/60 focus:outline-none"
              />
              <button
                type="submit"
                aria-label="Send message"
                disabled={!draft.trim()}
                className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary text-black transition-all duration-150 hover:brightness-110 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
              >
                <SendHorizonal className="size-4" aria-hidden />
              </button>
            </form>

            <div className="border-t border-white/10 px-5 py-4">
              <p className="kicker text-white/40">Start together</p>
              {isHost ? (
                <button
                  type="button"
                  onClick={onRollCall}
                  className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-bold text-black transition-all duration-150 hover:-translate-y-px hover:shadow-[0_10px_28px_rgba(0,168,225,0.35)] active:translate-y-0"
                >
                  <Play className="size-4 fill-current" aria-hidden />
                  Roll call — 3 · 2 · 1
                </button>
              ) : (
                <p className="mt-2 text-xs text-white/50">
                  Waiting for the host to roll the call…
                </p>
              )}
              <p className="mt-2 text-[11px] leading-relaxed text-white/40">
                Everyone presses play together — playback itself isn&apos;t frame-synced.
              </p>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
