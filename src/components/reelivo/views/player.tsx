"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Play } from "lucide-react";
import { hrefFor, navigate, useDetailStaleTime, useTmdb } from "@/lib/hooks";
import { isProgressMessage, playerUrl } from "@/lib/player";
import { progressKey, useReelivo, type SavedItem } from "@/lib/store";
import { poster, runtime as fmtRuntime, score, still, titleOf, yearOf } from "@/lib/format";
import type { MovieDetail, Paged, MediaItem, TvDetail, TvSeason } from "@/lib/tmdb-types";
import { Img, LostLink } from "../bits";
import { toSavedItem } from "../media";
import { AdBreakGate } from "../ad-break";

type Detail = MovieDetail | TvDetail;

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
  const savedProgress = useReelivo((g) => g.getProgress(id, type, s, e));
  const saveProgress = useReelivo((g) => g.saveProgress);
  const setLastEpisode = useReelivo((g) => g.setLastEpisode);
  const pushRecent = useReelivo((g) => g.pushRecent);
  const logHistory = useReelivo((g) => g.logHistory);

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

  const iframeSrc = useMemo(() => {
    const resume = savedProgress?.timestamp ?? 0;
    return playerUrl({ type, id, season: s, episode: e, resumeSeconds: resume });
    // savedProgress.timestamp intentionally read at mount only — the param resumes once
  }, [type, id, s, e]);

  // progress messages from the player
  const lastSave = useRef(0);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isProgressMessage(event.data)) return;
      const now = Date.now();
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
          timestamp: event.data.timestamp ?? 0,
          duration: event.data.duration ?? 0,
        });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [detail.data, id, type, s, e, saveProgress]);

  const backHref = hrefFor({ name: "detail", type, id });

  /* ------------------------- pre-roll ad break ------------------------- */
  /* AdBreakGate (keyed per title/season/episode) overlays the frame while the
   * stream preloads underneath; the cap lives in lib/ads.ts and kids profiles
   * never see it. */
  const kidsActive = useReelivo(
    (g) => g.profiles.find((p) => p.id === g.activeProfileId)?.kids ?? false
  );
  const adGateKey = `${type}-${id}-${s}-${e}`;

  // Esc returns to the title page
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") navigate(backHref);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
      <header className="flex items-center justify-between gap-4 px-4 py-3 md:px-8">
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
        <div className="min-w-0 text-right">
          <p className="truncate text-sm font-semibold text-white/95">{title}</p>
          <p className="text-xs text-white/45">
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
                  className="h-full w-full border-0"
                />
                {/* preloads underneath the break; never on kids profiles */}
                {!kidsActive && (
                  <AdBreakGate key={adGateKey} onExit={() => navigate(backHref)} />
                )}
              </>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-white/40">
            <p>
              Free · ad-supported stream via Videasy. If nothing plays, the source may be
              resting — try another title or come back soon.
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
    </div>
  );
}
