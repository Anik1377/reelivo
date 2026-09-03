"use client";

import { useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { hrefFor, navigate, tmdbFetch } from "@/lib/hooks";
import { slugify, still, uniqueById } from "@/lib/format";
import type { Genre, MediaItem, Paged } from "@/lib/tmdb-types";
import { Chip, EmptyNote, ErrorNote, Img, SectionHead, StillSkeleton } from "../bits";
import { StillCard } from "../media";

type Mode = "trending" | "acclaimed" | "newest";

const MODES: { key: Mode; label: string }[] = [
  { key: "trending", label: "Trending" },
  { key: "acclaimed", label: "Acclaimed" },
  { key: "newest", label: "Newest" },
];

const MODE_KEYS: ReadonlySet<string> = new Set(MODES.map((m) => m.key));

const EMPTY_RESULTS: MediaItem[] = [];

function paramsFor(kind: "movie" | "tv", mode: Mode, genre: number | null): Record<string, string> {
  const p: Record<string, string> = { include_adult: "false" };
  if (genre) p.with_genres = String(genre);

  if (kind === "movie") {
    if (mode === "trending") p.sort_by = "popularity.desc";
    if (mode === "acclaimed") {
      p.sort_by = "vote_average.desc";
      p["vote_count.gte"] = "1500";
      p["vote_average.gte"] = "7";
    }
    if (mode === "newest") {
      p.sort_by = "primary_release_date.desc";
      p["vote_count.gte"] = "60";
      p["primary_release_date.lte"] = new Date().toISOString().slice(0, 10);
    }
  } else {
    if (mode === "trending") p.sort_by = "popularity.desc";
    if (mode === "acclaimed") {
      p.sort_by = "vote_average.desc";
      p["vote_count.gte"] = "600";
      p["vote_average.gte"] = "7.2";
    }
    if (mode === "newest") {
      p.sort_by = "first_air_date.desc";
      p["vote_count.gte"] = "30";
      p["first_air_date.lte"] = new Date().toISOString().slice(0, 10);
    }
  }
  return p;
}

function useGenres(kind: "movie" | "tv") {
  return useQuery<Genre[]>({
    queryKey: ["genres", kind],
    queryFn: async () => {
      const data = await tmdbFetch<{ genres: Genre[] }>(`genre/${kind}/list`);
      return data.genres;
    },
    staleTime: 24 * 60 * 60 * 1000,
  });
}

export function BrowseView({
  kind,
  genreSlug,
  modeSlug,
}: {
  kind: "movie" | "tv";
  genreSlug?: string;
  modeSlug?: string;
}) {
  const genresQ = useGenres(kind);

  /* Both genre AND mode live in the hash so browse states are shareable:
     #/films/horror/acclaimed · #/films/acclaimed (mode without a genre).
     A bare mode in the genre slot (#/films/acclaimed) is detected and shifted. */
  const browseName = kind === "movie" ? "films" : "series";
  const rawGenre = genreSlug && !MODE_KEYS.has(genreSlug) ? genreSlug : undefined;
  const mode: Mode =
    modeSlug && MODE_KEYS.has(modeSlug)
      ? (modeSlug as Mode)
      : genreSlug && MODE_KEYS.has(genreSlug)
        ? (genreSlug as Mode)
        : "trending";
  const genre =
    genresQ.data && rawGenre
      ? (genresQ.data.find((g) => slugify(g.name) === rawGenre)?.id ?? null)
      : null;
  const genreName = genre ? (genresQ.data?.find((g) => g.id === genre)?.name ?? null) : null;

  useEffect(() => {
    const lens = mode === "trending" ? "" : ` · ${MODES.find((m) => m.key === mode)?.label}`;
    if (genreName) document.title = `${genreName} ${kind === "movie" ? "films" : "series"}${lens} — Reelivo`;
    else document.title = `${kind === "movie" ? "Films" : "Series"}${lens} — Reelivo`;
    return () => {
      document.title = "Reelivo — what to watch tonight";
    };
  }, [genreName, kind, mode]);

  const setGenre = (id: number | null) => {
    if (id === null) {
      navigate(hrefFor({ name: browseName, mode }));
      return;
    }
    const g = genresQ.data?.find((x) => x.id === id);
    navigate(hrefFor({ name: browseName, genre: g ? slugify(g.name) : undefined, mode }));
  };

  const setMode = (m: Mode) => {
    navigate(hrefFor({ name: browseName, genre: rawGenre, mode: m }));
  };

  const q = useInfiniteQuery({
    queryKey: ["discover", kind, mode, genre],
    queryFn: ({ pageParam }) =>
      tmdbFetch<Paged<MediaItem>>(`discover/${kind}`, {
        ...paramsFor(kind, mode, genre),
        page: pageParam as number,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page < Math.min(last.total_pages, 25) ? last.page + 1 : undefined,
    staleTime: 5 * 60 * 1000,
  });

  const items = uniqueById((q.data?.pages ?? []).flatMap((p) => p.results).filter((i) => !i.adult));

  /* Infinite scroll — when the sentinel below the grid drifts into view
   * (rootMargin pre-fetches ~2 rows early), pull the next page automatically.
   * A manual "Load more" button remains as the no-IntersectionObserver fallback. */
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  const canAutoLoad =
    hasNextPage && !isFetchingNextPage && typeof IntersectionObserver !== "undefined";
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !canAutoLoad) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) fetchNextPage();
      },
      { rootMargin: "1000px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [canAutoLoad, fetchNextPage]);

  /* Ambient genre art — the top result's backdrop from the FIRST page only.
   * firstPage is referentially stable while the query is cached, so the artwork
   * never swaps when "Load more" appends pages. */
  const firstPage: MediaItem[] = q.data?.pages?.[0]?.results ?? EMPTY_RESULTS;
  const heroItem = useMemo(
    () => (genreName ? (firstPage.find((i) => i.backdrop_path && !i.adult) ?? null) : null),
    [genreName, firstPage]
  );

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-24 md:px-8 md:pt-28 2xl:max-w-[1720px]">
      {genreName && heroItem ? (
        <div
          className="grain relative -mx-4 mb-6 h-52 overflow-hidden md:mx-0 md:h-64 md:rounded-2xl"
          aria-hidden={false}
        >
          <Img
            src={still(heroItem.backdrop_path, "w1280")}
            alt=""
            fallbackTitle={genreName}
            className="absolute inset-0 h-full w-full object-cover"
            sizesHint="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/10" />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 md:p-7">
            <div>
              <p className="kicker text-primary">
                Genre · {MODES.find((m) => m.key === mode)?.label}
              </p>
              <h1 className="display mt-1.5 text-[clamp(26px,4vw,44px)] leading-tight text-white text-balance">
                {genreName} {kind === "movie" ? "films" : "series"}
              </h1>
            </div>
            <span className="mb-1 hidden shrink-0 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-xs font-semibold text-white/80 backdrop-blur-sm sm:block">
              {q.isFetching && !q.isFetchingNextPage ? "Updating…" : `${items.length} titles`}
            </span>
          </div>
        </div>
      ) : (
        <SectionHead
          kicker={genreName ?? "The catalogue"}
          title={
            genreName
              ? kind === "movie"
                ? `${genreName} films`
                : `${genreName} series`
              : kind === "movie"
                ? "Films"
                : "Series"
          }
          aside={
            <span className="text-xs text-ink-dim">
              {q.isFetching && !q.isFetchingNextPage ? "Updating…" : `${items.length} titles`}
            </span>
          }
        />
      )}

      <div className="no-scrollbar sticky top-14 z-30 -mx-4 mt-5 space-y-3 border-b border-white/[0.06] bg-background/85 px-4 pb-3 pt-1 backdrop-blur-md md:top-16 md:mx-0 md:rounded-xl md:border md:border-white/[0.06] md:px-4 md:pb-3.5">
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Sort">
          {MODES.map((m) => (
            <Chip key={m.key} selected={mode === m.key} onClick={() => setMode(m.key)}>
              {m.label}
            </Chip>
          ))}
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Genre">
          <Chip selected={genre === null} onClick={() => setGenre(null)}>
            All genres
          </Chip>
          {(genresQ.data ?? []).map((g) => (
            <Chip
              key={g.id}
              selected={genre === g.id}
              onClick={() => setGenre(genre === g.id ? null : g.id)}
            >
              {g.name}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-8">
        {q.isPending ? (
          <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" aria-hidden>
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i}>
                <StillSkeleton className="aspect-video w-full" />
                <StillSkeleton className="mt-2.5 h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : q.isError ? (
          <ErrorNote onRetry={() => q.refetch()} />
        ) : items.length === 0 ? (
          <EmptyNote title={`No ${genreName ?? ""} ${kind === "movie" ? "films" : "series"} found`.trim()}>
            The catalogue came back empty for this filter — try another genre or check back soon.
          </EmptyNote>
        ) : (
          <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {items.map((i) => {
              const date = i.release_date || i.first_air_date;
              return (
                <StillCard
                  key={i.id}
                  item={i}
                  type={kind}
                  fluid
                  preview
                  showScore={false}
                  sub={`${date ? date.slice(0, 4) : ""} · ${kind === "movie" ? "Film" : "Series"}`}
                />
              );
            })}
          </div>
        )}

        {q.hasNextPage && !q.isError && (
          <div
            ref={sentinelRef}
            className="mt-10 flex flex-col items-center gap-3 text-center"
            aria-live="polite"
          >
            {q.isFetchingNextPage ? (
              <>
                <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
                <p className="text-[13px] text-ink-dim">Fetching more titles…</p>
              </>
            ) : typeof IntersectionObserver === "undefined" ? (
              <button
                type="button"
                onClick={() => q.fetchNextPage()}
                disabled={q.isFetchingNextPage}
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-white/10 px-6 text-sm font-semibold text-white transition-colors duration-150 hover:bg-white/20 disabled:opacity-60"
              >
                Load more
              </button>
            ) : (
              <p className="text-[13px] text-ink-dim">Keep scrolling — more {genreName ?? (kind === "movie" ? "films" : "series")} ahead</p>
            )}
          </div>
        )}
        {!q.hasNextPage && !q.isPending && !q.isError && items.length > 0 && (
          <p className="mt-12 flex items-center justify-center gap-3 text-[12px] tracking-[0.12em] text-ink-dim/70 uppercase">
            <span aria-hidden className="h-px w-8 bg-white/10" />
            That’s every title — {items.length} total
            <span aria-hidden className="h-px w-8 bg-white/10" />
          </p>
        )}
      </div>
    </div>
  );
}
