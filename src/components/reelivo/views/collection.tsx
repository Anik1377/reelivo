"use client";

import { useEffect, useMemo } from "react";
import { Play } from "lucide-react";
import { hrefFor, navigate, useDetailStaleTime, usePrefetchDetail, useTmdb } from "@/lib/hooks";
import { dek, poster, score, still, yearOf } from "@/lib/format";
import { progressKey, useReelivo } from "@/lib/store";
import type { CollectionDetail, MediaItem } from "@/lib/tmdb-types";
import { ErrorNote, Img, StillSkeleton } from "../bits";

/* A franchise viewing order — parts sorted by release, with personal progress. */

function PartRow({ part, index }: { part: MediaItem; index: number }) {
  const type = (part.media_type as "movie" | "tv") ?? "movie";
  const title = part.title ?? part.name ?? "Untitled";
  const prefetch = usePrefetchDetail();
  const progress = useReelivo((s) => s.progress);

  const entry = progress[progressKey(part.id, type)];
  const pct =
    entry && entry.duration > 0
      ? Math.min(100, Math.round((entry.timestamp / entry.duration) * 100))
      : 0;
  const watched = pct >= 95;
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

export function CollectionView({ id }: { id: number }) {
  const stale = useDetailStaleTime();
  const q = useTmdb<CollectionDetail>(`collection/${id}`, {}, stale);

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

  if (q.isPending) {
    return (
      <div aria-busy className="pb-16">
        <StillSkeleton className="h-[34vh] min-h-[240px] w-full rounded-none" />
        <div className="mx-auto max-w-[1000px] px-4 md:px-8">
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

      <div className="mx-auto max-w-[1000px] px-4 md:px-8">
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
