"use client";

import { useEffect, useMemo } from "react";
import { ArrowLeft, Clapperboard } from "lucide-react";
import { navigate, useDetailStaleTime, usePrefetchDetail, useTmdb } from "@/lib/hooks";
import { DIRECTOR_FLOOR } from "@/lib/curated";
import { dek, profile as profileUrl, score, yearOf } from "@/lib/format";
import type {
  CombinedCredits,
  MediaItem,
  PersonCredit,
  PersonDetail,
} from "@/lib/tmdb-types";
import { ErrorNote, StillSkeleton } from "../bits";
import { StillCard } from "../media";

/* A director's best works — their credited direction, ranked honestly by
 * rating with a vote floor so one 10/10 with 12 votes can't top the board. */

function bestDirection(credits: CombinedCredits | undefined): PersonCredit[] {
  const seen = new Set<number>();
  const out: PersonCredit[] = [];
  for (const c of credits?.crew ?? []) {
    if (c.job !== "Director") continue;
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out
    .filter((c) => (c.vote_count ?? 0) >= DIRECTOR_FLOOR)
    .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0))
    .slice(0, 14);
}

/** PersonCredit → MediaItem so StillCard (and its pop card) can render it. */
function creditToMedia(c: PersonCredit): MediaItem {
  return {
    id: c.id,
    media_type: c.media_type ?? "movie",
    title: c.title,
    name: c.name,
    poster_path: c.poster_path ?? null,
    backdrop_path: c.backdrop_path ?? null,
    vote_average: c.vote_average,
    vote_count: c.vote_count,
    release_date: c.release_date,
    first_air_date: c.first_air_date,
  };
}

export function DirectorView({ id }: { id: number }) {
  const stale = useDetailStaleTime();
  const person = useTmdb<PersonDetail>(`person/${id}`, {}, stale);
  const credits = useTmdb<CombinedCredits>(`person/${id}/combined_credits`, {}, stale);
  const prefetch = usePrefetchDetail();

  const best = useMemo(() => bestDirection(credits.data), [credits.data]);

  useEffect(() => {
    if (person.data) {
      document.title = `${person.data.name} — best works — Reelivo`;
    }
    return () => {
      document.title = "Reelivo — what to watch tonight";
    };
  }, [person.data]);

  if (person.isLoading || credits.isLoading) {
    return (
      <div aria-busy className="mx-auto max-w-[1400px] px-4 pt-28 md:px-8 2xl:max-w-[1660px]">
        <div className="flex items-center gap-6">
          <StillSkeleton className="h-[168px] w-[112px] rounded-2xl" />
          <div className="space-y-3">
            <StillSkeleton className="h-8 w-64" />
            <StillSkeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => (
            <StillSkeleton key={i} className="aspect-[2/3] w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (person.isError || !person.data) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-40">
        <ErrorNote onRetry={() => person.refetch()} />
      </div>
    );
  }

  const p = person.data;
  const bio = dek((p.biography ?? "").split("\n\n")[0]);
  const avg =
    best.length > 0
      ? best.reduce((acc, c) => acc + (c.vote_average ?? 0), 0) / best.length
      : 0;

  return (
    <article className="pb-16">
      {/* portrait hero */}
      <div className="relative h-[30vh] min-h-[220px] w-full overflow-hidden">
        {best[0]?.backdrop_path && (
          <img
            src={`https://image.tmdb.org/t/p/w1280${best[0].backdrop_path}`}
            alt=""
            aria-hidden
            className="h-full w-full object-cover object-top opacity-35"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/20" />
      </div>

      <div className="relative z-10 mx-auto -mt-24 max-w-[1400px] px-4 md:px-8 2xl:max-w-[1660px]">
        <button
          type="button"
          onClick={() => navigate("#/")}
          className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-dim transition-colors hover:text-white"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back home
        </button>

        <div className="flex flex-wrap items-end gap-6">
          <img
            src={profileUrl(p.profile_path, "w185") ?? ""}
            alt={`${p.name} portrait`}
            className="h-[168px] w-[112px] rounded-2xl object-cover ring-1 ring-white/15 shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
          />
          <div className="min-w-0 flex-1 pb-1">
            <p className="kicker text-primary">Best works · direction</p>
            <h1 className="display mt-1.5 text-[clamp(26px,4vw,44px)] leading-[1.05] text-white">
              {p.name}
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-white/65">
              <span>{p.known_for_department ?? "Directing"}</span>
              {best.length > 0 && (
                <>
                  <span className="text-white/25" aria-hidden>
                    ·
                  </span>
                  <span className="tabular">{best.length} ranked titles</span>
                  <span className="text-white/25" aria-hidden>
                    ·
                  </span>
                  <span className="tabular">avg {score(avg)}</span>
                </>
              )}
            </div>
            {bio && (
              <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-white/60">{bio}</p>
            )}
          </div>
        </div>

        {/* the board */}
        <section aria-label={`Best works directed by ${p.name}`} className="mt-10">
          {credits.isError ? (
            <ErrorNote onRetry={() => credits.refetch()} />
          ) : best.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-surface-2 px-4 py-6 text-sm text-ink-dim">
              <Clapperboard className="size-4 shrink-0" aria-hidden />
              No directing credits with enough votes to rank yet — check the full
              profile instead.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {best.map((c, i) => {
                const m = creditToMedia(c);
                const type = (c.media_type as "movie" | "tv") ?? "movie";
                return (
                  <div
                    key={`${c.id}-${i}`}
                    className="group relative"
                    onMouseEnter={() => prefetch(type, c.id)}
                  >
                    <span
                      aria-hidden
                      className="tabular display pointer-events-none absolute -left-1.5 -top-2 z-10 text-[30px] leading-none text-white/25 transition-colors duration-200 group-hover:text-primary/90"
                    >
                      {i + 1}
                    </span>
                    <StillCard
                      item={m}
                      type={type}
                      preview
                      sub={`${yearOf(m)} · Directed`}
                      showScore={false}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <p className="mt-8 text-[11.5px] tracking-wide text-ink-dim/70">
          Ranked by TMDB rating, {DIRECTOR_FLOOR}+ votes. Only credited direction counts.
        </p>
      </div>
    </article>
  );
}
