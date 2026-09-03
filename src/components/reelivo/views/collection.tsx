"use client";

import { useEffect, useMemo } from "react";
import { Check, Play, RotateCcw } from "lucide-react";
import { hrefFor, navigate, useDetailStaleTime, usePrefetchDetail, useTmdb } from "@/lib/hooks";
import { dek, poster, score, still, yearOf } from "@/lib/format";
import { progressKey, useReelivo, type ProgressEntry } from "@/lib/store";
import type { CollectionDetail, MediaItem } from "@/lib/tmdb-types";
import { ErrorNote, Img, LostLink, StillSkeleton } from "../bits";

/* A franchise viewing order — parts sorted by release, with personal progress. */

/** Shared part-progress math (Task 7's row badges + wave 2-e's saga strip):
 * pct 0..100 from the active profile's progress mirror, watched at the same
 * 95% line the row badges have always used — one predicate, no drift. */
function partProgress(progress: Record<string, ProgressEntry>, part: MediaItem) {
  const type = (part.media_type as "movie" | "tv") ?? "movie";
  const entry = progress[progressKey(part.id, type)];
  const pct =
    entry && entry.duration > 0
      ? Math.min(100, Math.round((entry.timestamp / entry.duration) * 100))
      : 0;
  return { type, entry, pct, watched: pct >= 95 };
}

function PartRow({ part, index }: { part: MediaItem; index: number }) {
  const title = part.title ?? part.name ?? "Untitled";
  const prefetch = usePrefetchDetail();
  const progress = useReelivo((s) => s.progress);
  const { type, pct, watched } = partProgress(progress, part);
  const open = () => navigate(hrefFor({ name: "detail", type, id: part.id }));

  return (
    <li className="group relative">
      {pct > 0 && !watched && (
        <span
          aria-hidden
          className="absolute bottom-0 left-0 z-10 h-[2px] rounded-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      )}
      <div
        role="link"
        tabIndex={0}
        aria-label={`${title} — open details`}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === "Enter") open();
        }}
        onMouseEnter={() => prefetch(type, part.id)}
        onFocus={() => prefetch(type, part.id)}
        className="flex cursor-pointer items-center gap-4 rounded-xl border border-transparent p-3 transition-colors duration-150 hover:border-white/[0.08] hover:bg-white/[0.03]"
      >
        <span
          className="tabular display w-8 shrink-0 text-right text-[22px] leading-none text-white/20 transition-colors duration-200 group-hover:text-primary/80 md:w-10 md:text-[26px]"
          aria-hidden
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <Img
          src={poster(part.poster_path, "w185")}
          alt=""
          fallbackTitle={title}
          className="h-[84px] w-14 shrink-0 rounded-md object-cover ring-1 ring-white/[0.07]"
        />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <span className="min-w-0 truncate text-[14.5px] font-semibold text-foreground transition-colors group-hover:text-primary">
              {title}
            </span>
            {watched && (
              <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-ink-dim uppercase">
                Watched
              </span>
            )}
            {!watched && pct > 0 && (
              <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-primary-foreground uppercase">
                Resume
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-ink-dim">
            {[
              yearOf({ release_date: part.release_date, first_air_date: part.first_air_date }),
              score(part.vote_average),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {part.overview && (
            <p className="mt-1 line-clamp-1 text-xs leading-relaxed text-ink-dim/85">
              {dek(part.overview)}
            </p>
          )}
        </div>
        <button
          type="button"
          aria-label={`Play ${title} free`}
          onClick={(e) => {
            e.stopPropagation();
            navigate(hrefFor({ name: "play", type, id: part.id }));
          }}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-black opacity-0 transition-all duration-150 hover:scale-105 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Play className="ml-0.5 size-4 fill-current" aria-hidden />
        </button>
      </div>
    </li>
  );
}

/* ------------------------------ saga progress ------------------------------ */

/** "You've watched 2 of 3 parts" + a slim segmented bar + the next-part CTA.
 * Derives purely from the progress mirror (the same store read the part rows
 * use), so SSR and the first client render agree (empty) and live progress
 * updates re-render the strip like any other subscriber. Quiet states: no
 * progress at all → just "N-part saga" meta; fewer than 2 parts → nothing. */
function SagaProgress({ parts }: { parts: MediaItem[] }) {
  const progress = useReelivo((s) => s.progress);

  const states = useMemo(
    () => parts.map((part) => ({ part, ...partProgress(progress, part) })),
    [parts, progress]
  );
  const watchedCount = states.filter((s) => s.watched).length;
  const touchedCount = states.filter((s) => s.entry).length;

  if (parts.length < 2) return null;

  // zero entries anywhere — a quiet count, no bar, no CTA
  if (touchedCount === 0) {
    return <p className="mt-4 text-[12.5px] text-ink-dim">{parts.length}-part saga</p>;
  }

  const complete = watchedCount === parts.length;
  const next = states.find((s) => !s.watched); // release order → first unwatched
  const titleOf = (p: MediaItem) => p.title ?? p.name ?? "Untitled";

  return (
    <div className="mt-4 rounded-xl border border-white/[0.06] bg-surface px-4 py-3.5">
      {complete ? (
        <p className="flex items-center gap-2 text-[13.5px] font-semibold text-white">
          <Check className="size-4 shrink-0 text-primary" aria-hidden />
          Saga complete — rewatch anytime
        </p>
      ) : (
        <p className="text-[13px] text-white/70">
          You&rsquo;ve watched <span className="font-semibold text-white">{watchedCount}</span> of{" "}
          {parts.length} parts
        </p>
      )}

      {/* slim segmented bar — watched segments filled cyan, in-flight ones filled
        * to their exact %, untouched ones stay a quiet white/10 track */}
      <div className="mt-2.5 flex gap-1.5" aria-hidden>
        {states.map(({ part, pct, watched }) => (
          <span
            key={part.id}
            className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"
          >
            {watched ? (
              <span className="absolute inset-0 rounded-full bg-primary" />
            ) : pct > 0 ? (
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-primary"
                style={{ width: `${pct}%` }}
              />
            ) : null}
          </span>
        ))}
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        {complete ? (
          <button
            type="button"
            onClick={() =>
              navigate(
                hrefFor({ name: "play", type: states[0].type, id: states[0].part.id })
              )
            }
            className="inline-flex h-11 items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-5 text-[13px] font-semibold text-white/80 transition-colors duration-150 hover:border-white/30 hover:text-white"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Start over
          </button>
        ) : next ? (
          <button
            type="button"
            onClick={() => navigate(hrefFor({ name: "play", type: next.type, id: next.part.id }))}
            className="inline-flex h-11 min-w-0 max-w-full items-center gap-2 rounded-full bg-white px-5 text-[13px] font-bold text-black transition-all duration-150 hover:bg-white/85 active:scale-[0.97]"
            aria-label={`Play part ${states.indexOf(next) + 1}, ${titleOf(next.part)}, free`}
          >
            <Play className="size-4 shrink-0 fill-current" aria-hidden />
            <span className="truncate">
              Continue the saga — Part {String(states.indexOf(next) + 1).padStart(2, "0")}:{" "}
              {titleOf(next.part)}
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function CollectionView({ id }: { id: number }) {
  const stale = useDetailStaleTime();
  const q = useTmdb<CollectionDetail>(id ? `collection/${id}` : null, {}, stale);

  const parts = useMemo(() => {
    const raw = q.data?.parts ?? [];
    return [...raw]
      .filter((p) => !p.adult)
      .sort((a, b) => {
        const da = a.release_date ?? a.first_air_date ?? "9999";
        const db = b.release_date ?? b.first_air_date ?? "9999";
        return da.localeCompare(db);
      });
  }, [q.data]);

  useEffect(() => {
    if (q.data) document.title = `${q.data.name} — Collection — Reelivo`;
    return () => {
      document.title = "Reelivo — what to watch tonight";
    };
  }, [q.data]);

  /* Truncated/junk share links parse to id 0 — designed dead-end, idle query. */
  if (!id) return <LostLink />;

  if (q.isPending) {
    return (
      <div aria-busy className="pb-16">
        <StillSkeleton className="h-[34vh] min-h-[240px] w-full rounded-none" />
        <div className="mx-auto max-w-[1000px] px-4 md:px-8 2xl:max-w-[1180px]">
          <div className="-mt-16 space-y-3">
            <StillSkeleton className="h-10 w-2/3" />
            <StillSkeleton className="h-4 w-1/3" />
            <div className="mt-8 space-y-2">
              {[0, 1, 2].map((i) => (
                <StillSkeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (q.isError || !q.data) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-40">
        <ErrorNote onRetry={() => q.refetch()} />
      </div>
    );
  }

  const avg =
    parts.length > 0
      ? parts.reduce((acc, p) => acc + (p.vote_average ?? 0), 0) / parts.length
      : 0;

  return (
    <article className="pb-16">
      {/* backdrop hero */}
      <div className="relative h-[34vh] min-h-[240px] w-full">
        <Img
          src={still(q.data.backdrop_path, "original") ?? poster(q.data.poster_path, "w780")}
          alt={`${q.data.name} — backdrop`}
          fallbackTitle={q.data.name}
          className="h-full w-full object-cover object-top"
          sizesHint="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/10" />
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent" />
      </div>

      <div className="mx-auto max-w-[1000px] px-4 md:px-8 2xl:max-w-[1180px]">
        <div className="relative z-10 -mt-20 md:-mt-24">
          <p className="kicker text-primary">Collection</p>
          <h1 className="display mt-2 text-[clamp(26px,4vw,44px)] leading-[1.05] text-white">
            {q.data.name}
          </h1>
          <p className="mt-2.5 text-[13.5px] text-white/70">
            {parts.length} {parts.length === 1 ? "film" : "films"}
            {avg > 0 && ` · ★ ${avg.toFixed(1)} average`}
            <span className="mx-2 text-white/25" aria-hidden>
              ·
            </span>
            <span className="text-ink-dim">in release order</span>
          </p>

          {/* saga progress — visible from 2 parts on, quiet until you press play */}
          <SagaProgress parts={parts} />

          {q.data.overview && (
            <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-foreground/85">
              {dek(q.data.overview)}
            </p>
          )}
        </div>

        {parts.length === 0 ? (
          <p className="mt-10 text-sm text-ink-dim">No films in this collection yet.</p>
        ) : (
          <ol className="mt-8 space-y-1">
            {parts.map((p, i) => (
              <PartRow key={p.id} part={p} index={i} />
            ))}
          </ol>
        )}
      </div>
    </article>
  );
}
