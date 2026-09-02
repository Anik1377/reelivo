"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  ExternalLink,
  MessageSquareQuote,
  Play,
  Share2,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { hrefFor, navigate, tmdbFetch, useDetailStaleTime, usePrefetchDetail, useTmdb } from "@/lib/hooks";
import { progressKey, useReelivo } from "@/lib/store";
import {
  airLabel,
  dateOf,
  dek,
  logo,
  poster,
  profile,
  runtime as fmtRuntime,
  score,
  slugify,
  still,
  titleOf,
  weekWindow,
  yearOf,
} from "@/lib/format";
import type {
  CollectionRef,
  ContentRatings,
  Credits,
  MediaItem,
  MovieDetail,
  Paged,
  ReleaseDates,
  ReviewResult,
  Reviews,
  TvDetail,
  TvEpisode,
  TvSeason,
  Videos,
  WatchProviders,
} from "@/lib/tmdb-types";
import { ErrorNote, Img, RailSkeleton, Score, StillSkeleton, useMounted } from "../bits";
import { Rail, StillCard, toSavedItem } from "../media";
import { openFolderPicker } from "../folder-picker";
import { TrailerDialog } from "../trailer-dialog";

type Detail = MovieDetail | TvDetail;

const REGIONS = ["US", "GB", "CA", "AU", "DE", "FR", "ES", "IT", "BR", "MX", "IN", "JP", "KR"];

function nameOf(d: Detail): string {
  return "title" in d ? d.title : d.name;
}

/* --------------------------- next-episode chip ----------------------------- */

/** "Next episode · S2E4 · Mar 3" — only while the date is still in the future. */
function NextEpisodeChip({ detail }: { detail: TvDetail }) {
  const next = detail.next_episode_to_air;
  if (!next?.air_date || !next.episode_number) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (next.air_date < today) return null; // stale feed — don't promise the past
  const when = new Date(`${next.air_date}T00:00:00`);
  const label = Number.isNaN(when.getTime())
    ? next.air_date
    : when.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <span
      className="rounded-full border border-primary/50 bg-primary/10 px-2 py-0.5 text-[10.5px] font-bold tracking-wide text-primary"
      title={`Next episode airs ${label}`}
    >
      Next ep · S{next.season_number ?? 1}E{next.episode_number} · {label}
    </span>
  );
}

/* -------------------------- certification badge --------------------------- */

function CertBadge({ id, type }: { id: number; type: "movie" | "tv" }) {
  const stale = useDetailStaleTime();
  const qMovie = useTmdb<ReleaseDates>(
    type === "movie" ? `movie/${id}/release_dates` : null,
    {},
    stale
  );
  const qTv = useTmdb<ContentRatings>(
    type === "tv" ? `tv/${id}/content_ratings` : null,
    {},
    stale
  );

  const cert = useMemo(() => {
    if (type === "movie") {
      const list = qMovie.data?.results ?? [];
      const us = list.find((r) => r.iso_3166_1 === "US");
      const pick =
        us?.release_dates.find((r) => r.certification)?.certification ??
        list
          .flatMap((r) => r.release_dates)
          .find((r) => r.certification)?.certification;
      return pick ?? null;
    }
    const list = qTv.data?.results ?? [];
    const us = list.find((r) => r.iso_3166_1 === "US");
    return us?.rating ?? list.find((r) => r.rating)?.rating ?? null;
  }, [type, qMovie.data, qTv.data]);

  if (!cert) return null;
  return (
    <span
      className="rounded border border-white/35 px-1.5 py-px text-[10px] font-bold tracking-[0.08em] text-white/75"
      title="Content rating (US)"
    >
      {cert}
    </span>
  );
}

/* ------------------------------ collection -------------------------------- */

function CollectionStrip({ collection }: { collection: CollectionRef }) {
  const prefetch = usePrefetchDetail();
  return (
    <a
      href={hrefFor({ name: "collection", id: collection.id })}
      onMouseEnter={() => prefetch("movie", collection.id)}
      className="group relative flex items-stretch overflow-hidden rounded-xl border border-white/[0.08] bg-surface transition-colors duration-200 hover:border-white/20"
      aria-label={`Explore the ${collection.name} collection`}
    >
      <div className="relative hidden w-56 shrink-0 sm:block md:w-64">
        <Img
          src={still(collection.backdrop_path, "w780")}
          alt=""
          fallbackTitle={collection.name}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-surface/40 to-surface" />
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="kicker text-primary">Collection</p>
          <p className="display mt-1 truncate text-[17px] text-foreground">{collection.name}</p>
          <p className="mt-0.5 text-xs text-ink-dim">
            Every chapter, in release order — watch the saga from the top.
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-3.5 py-2 text-[13px] font-semibold text-white transition-colors duration-150 group-hover:border-primary/60 group-hover:text-primary">
          Explore
          <ChevronRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </a>
  );
}

/* ------------------------------ hero + poster ----------------------------- */

function TitleBlock({
  detail,
  type,
  id,
}: {
  detail: Detail;
  type: "movie" | "tv";
  id: number;
}) {
  const title = nameOf(detail);
  const tagline = "tagline" in detail ? detail.tagline : null;
  const date = "release_date" in detail ? detail.release_date : detail.first_air_date;
  const lastEpisode = useReelivo((s) => s.lastEpisode[detail.id]);
  const mounted = useMounted();
  const stale = useDetailStaleTime();
  const videos = useTmdb<Videos>(`${type}/${id}/videos`, {}, stale);
  const [trailerOpen, setTrailerOpen] = useState(false);

  const trailerKey = useMemo(() => {
    const vids = (videos.data?.results ?? []).filter((v) => v.site === "YouTube");
    return (
      vids.find((v) => v.type === "Trailer") ??
      vids.find((v) => v.type === "Teaser") ??
      vids[0]
    )?.key ?? null;
  }, [videos.data]);

  const resume =
    type === "tv" && mounted && lastEpisode
      ? { season: lastEpisode.season, episode: lastEpisode.episode }
      : undefined;

  const facts: string[] = [];
  if (date) facts.push(yearOf({ release_date: date, first_air_date: date }));
  // Detail is a non-discriminated union; narrow via the route's type tag
  // (same cast-alias convention as the metadata rows below).
  const m = type === "movie" ? (detail as MovieDetail) : null;
  const t = type === "tv" ? (detail as TvDetail) : null;
  if (m?.runtime) facts.push(fmtRuntime(m.runtime));
  if (t?.number_of_seasons)
    facts.push(`${t.number_of_seasons} season${t.number_of_seasons > 1 ? "s" : ""}`);
  if (t?.number_of_episodes) facts.push(`${t.number_of_episodes} episodes`);

  return (
    <div className="min-w-0 flex-1">
      <p className="kicker text-primary">{type === "movie" ? "Film" : "Series"}</p>
      <h1 className="display mt-2 max-w-3xl text-[clamp(28px,4.5vw,50px)] leading-[1.03] text-white">
        {title}
      </h1>
      {tagline && (
        <p className="mt-2 max-w-2xl text-[15px] italic text-ink-dim">“{tagline}”</p>
      )}

      <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13.5px] text-white/70">
        {facts.map((f, i) => (
          <span key={i} className="flex items-center gap-3">
            {i > 0 && <span aria-hidden className="text-white/25">·</span>}
            {f}
          </span>
        ))}
        <Score value={detail.vote_average} className="text-[13.5px]" />
        <CertBadge id={id} type={type} />
        {type === "tv" && <NextEpisodeChip detail={detail as TvDetail} />}
        <span className="rounded bg-primary px-1.5 py-px text-[9.5px] font-bold tracking-[0.14em] text-primary-foreground">
          FREE
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {detail.genres?.slice(0, 4).map((g) => (
          <a
            key={g.id}
            href={hrefFor({
              name: type === "movie" ? "films" : "series",
              genre: slugify(g.name),
            })}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/70 transition-colors duration-150 hover:border-primary/60 hover:text-primary"
            aria-label={`Browse ${g.name} ${type === "movie" ? "films" : "series"}`}
          >
            {g.name}
          </a>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() =>
            navigate(
              hrefFor({
                name: "play",
                type,
                id: detail.id,
                season: resume?.season,
                episode: resume?.episode,
              })
            )
          }
          className="inline-flex h-12 items-center gap-2 rounded-lg bg-white px-6 text-[14.5px] font-bold text-black transition-colors duration-150 hover:bg-white/85"
        >
          <Play className="size-4.5 fill-current" aria-hidden />
          Watch Free
          {resume && (
            <span className="font-medium opacity-60">
              · S{resume.season} E{resume.episode}
            </span>
          )}
        </button>
        {trailerKey && (
          <button
            type="button"
            onClick={() => setTrailerOpen(true)}
            className="inline-flex h-12 items-center gap-2 rounded-lg bg-white/10 px-4 text-sm font-semibold text-white transition-colors duration-150 hover:bg-white/20"
          >
            <Clapperboard className="size-4" aria-hidden />
            Trailer
          </button>
        )}
        <SaveToggle detail={detail} type={type} title={title} />
        <button
          type="button"
          onClick={() => {
            const url = window.location.href;
            const share = (navigator as Navigator & { share?: (d: { title: string; url: string }) => Promise<void> }).share;
            if (typeof share === "function") {
              navigator
                .share({ title: `Watch ${title} on Reelivo`, url })
                .catch(() => undefined); // user dismissed the sheet
            } else {
              navigator.clipboard
                ?.writeText(url)
                .then(() => toast.success("Link copied"))
                .catch(() => toast.error("Couldn't share this title"));
            }
          }}
          className="inline-flex h-12 items-center gap-2 rounded-lg bg-white/10 px-4 text-sm font-semibold text-white transition-colors duration-150 hover:bg-white/20"
          aria-label="Share this title"
        >
          <Share2 className="size-4" aria-hidden />
          Share
        </button>
      </div>
      <p className="mt-2.5 text-[11.5px] text-white/40">Free stream · ad-supported</p>

      {trailerKey && (
        <TrailerDialog
          open={trailerOpen}
          onOpenChange={setTrailerOpen}
          videoKey={trailerKey}
          title={title}
        />
      )}
    </div>
  );
}

function SaveToggle({
  detail,
  type,
  title,
}: {
  detail: Detail;
  type: "movie" | "tv";
  title: string;
}) {
  const { toggleWatchlist, isInWatchlist } = useReelivo();
  const mounted = useMounted();
  const saved = mounted && isInWatchlist(detail.id);
  const media = useMemo(() => toSavedItem(detail as unknown as MediaItem, type), [detail, type]);

  return (
    <button
      type="button"
      onClick={() => {
        const r = toggleWatchlist(media);
        if (r === "added") {
          toast.success(`Saved “${title}” to My list`, {
            action: {
              label: "File into…",
              onClick: () => openFolderPicker({ id: detail.id, type, title }),
            },
          });
        } else {
          toast.message("Removed from your list");
        }
      }}
      className="inline-flex h-12 items-center gap-2 rounded-lg bg-white/10 px-4 text-sm font-semibold text-white transition-colors duration-150 hover:bg-white/20"
      aria-pressed={saved}
    >
      {saved ? (
        <BookmarkCheck className="size-4 text-primary" aria-hidden />
      ) : (
        <Bookmark className="size-4" aria-hidden />
      )}
      {saved ? "On your list" : "Save"}
    </button>
  );
}

/* ----------------------------- where to watch ----------------------------- */

function ProviderGroups({ id, type }: { id: number; type: "movie" | "tv" }) {
  const region = useReelivo((s) => s.region);
  const setRegion = useReelivo((s) => s.setRegion);
  const q = useTmdb<WatchProviders>(`${type}/${id}/watch/providers`, { watch_region: region });
  const data = q.data?.results?.[region];

  const groups: { label: string; items: { name: string; logo: string | null }[] }[] = [
    {
      label: "Included with subscription",
      items: (data?.flatrate ?? []).map((p) => ({
        name: p.provider_name,
        logo: logo(p.logo_path, "w92"),
      })),
    },
    {
      label: "Free with ads",
      items: (data?.free ?? []).map((p) => ({ name: p.provider_name, logo: logo(p.logo_path, "w92") })),
    },
    {
      label: "Rent",
      items: (data?.rent ?? []).map((p) => ({ name: p.provider_name, logo: logo(p.logo_path, "w92") })),
    },
    {
      label: "Buy",
      items: (data?.buy ?? []).map((p) => ({ name: p.provider_name, logo: logo(p.logo_path, "w92") })),
    },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-[12px] font-bold tracking-[0.14em] text-white/60 uppercase">
          Where to watch
        </h3>
        <label className="flex items-center gap-1.5 text-xs text-ink-dim">
          <span className="sr-only">Region</span>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="rounded-md border border-white/10 bg-surface-2 px-1.5 py-1 text-xs text-foreground outline-none focus-visible:border-primary"
            aria-label="Watch region"
          >
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </div>

      {q.isPending ? (
        <StillSkeleton className="h-16 w-full" />
      ) : groups.length === 0 ? (
        <p className="text-sm text-ink-dim">
          No listing services in {region} right now — the free stream below still works.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="mb-2 text-xs text-ink-dim">{g.label}</p>
              <div className="flex flex-wrap gap-2">
                {g.items.map((p) => (
                  <span
                    key={p.name}
                    className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-surface-2 px-2.5 py-1.5"
                    title={`${p.name} — ${g.label}`}
                  >
                    <Img
                      src={p.logo}
                      alt=""
                      fallbackTitle={p.name}
                      className="size-5 rounded-sm object-contain"
                    />
                    <span className="text-xs font-medium text-foreground">{p.name}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 border-t border-white/[0.06] pt-3 text-[11px] leading-relaxed text-ink-dim/80">
        Subscriptions may cost money on those services. The “Watch free” stream is separate and
        ad-supported.
      </p>
    </div>
  );
}

/* ---------------------------------- facts --------------------------------- */

const IMG_BASE = "https://image.tmdb.org/t/p";

/** Review avatars come either as a TMDB path ("/abc.jpg") or a full gravatar URL. */
function reviewAvatar(path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${IMG_BASE}/w92${path}`;
}

function ReviewCard({ review }: { review: ReviewResult }) {
  const [open, setOpen] = useState(false);
  const details = review.author_details;
  const name = details?.name?.trim() || details?.username || review.author;
  const avatar = reviewAvatar(details?.avatar_path);
  const initial = name.charAt(0).toUpperCase();
  const rating = typeof details?.rating === "number" && details.rating > 0 ? details.rating : null;
  const long = review.content.length > 420;

  return (
    <li className="rounded-xl border border-white/[0.06] bg-surface p-5 transition-colors duration-150 hover:border-white/[0.12]">
      <div className="flex items-center gap-3">
        {avatar ? (
          <Img
            src={avatar}
            alt=""
            fallbackTitle={initial}
            className="size-9 shrink-0 rounded-full object-cover ring-1 ring-white/10"
          />
        ) : (
          <span
            aria-hidden
            className="display grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-sm text-primary ring-1 ring-white/10"
          >
            {initial}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-foreground">{name}</p>
          <p className="text-[11px] text-ink-dim">
            {review.created_at
              ? new Date(review.created_at).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "TMDB member"}
          </p>
        </div>
        {rating && (
          <span className="tabular flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-semibold text-foreground">
            <Star className="size-3 fill-primary text-primary" aria-hidden />
            {rating}
            <span className="text-ink-dim">/10</span>
          </span>
        )}
      </div>
      <p
        className={`mt-3 text-[13.5px] leading-relaxed text-foreground/85 ${
          open ? "" : "line-clamp-5"
        }`}
      >
        {review.content.trim()}
      </p>
      {(long || review.url) && (
        <div className="mt-3 flex items-center gap-4">
          {long && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="text-xs font-semibold text-primary underline-offset-4 transition-colors hover:underline"
            >
              {open ? "Show less" : "Read full review"}
            </button>
          )}
          {review.url && (
            <a
              href={review.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-ink-dim transition-colors hover:text-primary"
            >
              On TMDB
              <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </div>
      )}
    </li>
  );
}

function ReviewsSection({ id, type }: { id: number; type: "movie" | "tv" }) {
  const stale = useDetailStaleTime();
  const q = useInfiniteQuery({
    queryKey: ["reviews", type, id],
    queryFn: ({ pageParam }) =>
      tmdbFetch<Reviews>(`${type}/${id}/reviews`, { page: pageParam as number }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page !== undefined && last.total_pages !== undefined && last.page < last.total_pages
        ? last.page + 1
        : undefined,
    staleTime: stale,
    retry: 1,
  });

  const [showAll, setShowAll] = useState(false);
  // "top" keeps TMDB's editorial/relevance order; "newest" re-ranks by creation
  // date client-side (the reviews endpoint has no server-side sort).
  const [sort, setSort] = useState<"top" | "newest">("top");
  const fetched = (q.data?.pages ?? []).flatMap((p) => p.results ?? []);
  const reviews = useMemo(
    () =>
      sort === "newest"
        ? [...fetched].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
        : fetched,
    [fetched, sort]
  );
  const total = q.data?.pages?.[0]?.total_results ?? reviews.length;
  const loadedAll = !q.hasNextPage;

  // auto-fetch the next page once the loader row drifts into view (expanded mode)
  // NOTE: hooks stay above the early return below — rules of hooks.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  const canAutoLoad = showAll && hasNextPage && !isFetchingNextPage;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !canAutoLoad || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) fetchNextPage();
      },
      { rootMargin: "600px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [canAutoLoad, fetchNextPage]);

  if (q.isPending || q.isError || reviews.length === 0) return null;

  const shown = showAll ? reviews : reviews.slice(0, 2);

  return (
    <section aria-label="Reviews">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h3 className="text-[12px] font-bold tracking-[0.14em] text-white/60 uppercase">
          Reviews
          <span className="ml-2.5 text-[11px] font-medium normal-case tracking-normal text-ink-dim/70">
            {total > reviews.length
              ? `${reviews.length} of ${total} · from TMDB members`
              : "from TMDB members"}
          </span>
        </h3>
        {reviews.length > 2 && (
          <div
            className="flex items-center gap-1 text-[11px] font-semibold"
            role="group"
            aria-label="Sort reviews"
          >
            <button
              type="button"
              onClick={() => setSort("top")}
              aria-pressed={sort === "top"}
              className={`rounded-full px-2.5 py-0.5 tracking-wide uppercase transition-colors duration-150 ${
                sort === "top"
                  ? "border border-primary/40 bg-primary/10 text-primary"
                  : "border border-transparent text-ink-dim hover:text-foreground"
              }`}
            >
              Top
            </button>
            <button
              type="button"
              onClick={() => setSort("newest")}
              aria-pressed={sort === "newest"}
              className={`rounded-full px-2.5 py-0.5 tracking-wide uppercase transition-colors duration-150 ${
                sort === "newest"
                  ? "border border-primary/40 bg-primary/10 text-primary"
                  : "border border-transparent text-ink-dim hover:text-foreground"
              }`}
            >
              Newest
            </button>
          </div>
        )}
      </div>
      <ul className="space-y-3">
        {shown.map((r) => (
          <ReviewCard key={r.id} review={r} />
        ))}
      </ul>
      <div ref={sentinelRef} className="mt-4 flex flex-wrap items-center gap-2.5">
        {reviews.length > 2 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-semibold text-white/80 transition-colors duration-150 hover:border-white/25 hover:text-white"
          >
            <MessageSquareQuote className="size-4 text-primary/80" aria-hidden />
            {showAll ? "Hide reviews" : `Show all ${reviews.length} reviews`}
          </button>
        )}
        {showAll && !loadedAll && (
          <button
            type="button"
            onClick={() => q.fetchNextPage()}
            disabled={q.isFetchingNextPage}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-semibold text-white/80 transition-colors duration-150 hover:border-primary/50 hover:text-primary disabled:opacity-60"
          >
            {q.isFetchingNextPage ? (
              <>
                <span
                  aria-hidden
                  className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-primary"
                />
                Fetching
              </>
            ) : (
              `Loading more (of ${total})`
            )}
          </button>
        )}
      </div>
    </section>
  );
}

function Facts({ detail, type, credits }: { detail: Detail; type: "movie" | "tv"; credits?: Credits }) {
  const crew = credits?.crew ?? [];
  const directors = crew.filter((c) => c.job === "Director" || c.job === "Series Director");
  const writers = crew.filter((c) =>
    ["Screenplay", "Writer", "Story"].includes(c.job)
  );
  const rows: { label: string; value: string; people?: { id: number; name: string }[] }[] = [];

  if (type === "movie") {
    const d = detail as MovieDetail;
    if (directors.length)
      rows.push({
        label: "Director",
        value: directors.map((c) => c.name).slice(0, 2).join(", "),
        people: directors.slice(0, 2).map((c) => ({ id: c.id, name: c.name })),
      });
    if (writers.length)
      rows.push({
        label: "Writers",
        value: writers.map((c) => c.name).slice(0, 3).join(", "),
        people: writers.slice(0, 3).map((c) => ({ id: c.id, name: c.name })),
      });
    if (d.production_companies?.length)
      rows.push({ label: "Studio", value: d.production_companies.slice(0, 2).map((c) => c.name).join(", ") });
    if (d.status) rows.push({ label: "Status", value: d.status.replace(/_/g, " ").toLowerCase() });
    if (d.original_language) rows.push({ label: "Language", value: d.original_language.toUpperCase() });
    if (d.budget && d.budget > 0)
      rows.push({ label: "Budget", value: `$${(d.budget / 1_000_000).toFixed(0)}M` });
  } else {
    const d = detail as TvDetail;
    if (d.created_by?.length)
      rows.push({
        label: "Created by",
        value: d.created_by.map((c) => c.name).slice(0, 2).join(", "),
        people: d.created_by.slice(0, 2).map((c) => ({ id: c.id, name: c.name })),
      });
    if (d.networks?.length)
      rows.push({ label: "Network", value: d.networks.slice(0, 2).map((n) => n.name).join(", ") });
    if (d.status) rows.push({ label: "Status", value: d.status.replace(/_/g, " ").toLowerCase() });
    if (d.episode_run_time?.[0]) rows.push({ label: "Episode", value: fmtRuntime(d.episode_run_time[0]) });
    if (d.original_language) rows.push({ label: "Language", value: d.original_language.toUpperCase() });
  }

  if (rows.length === 0 && !detail.imdb_id) return null;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface p-5">
      <h3 className="mb-3 text-[12px] font-bold tracking-[0.14em] text-white/60 uppercase">
        The details
      </h3>
      <dl className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex gap-3 text-sm">
            <dt className="w-24 shrink-0 text-ink-dim">{r.label}</dt>
            <dd className="min-w-0 flex-1 text-foreground/90 first-letter:uppercase">
              {r.people && r.people.length > 0
                ? r.people.map((person, i) => (
                    <span key={person.id}>
                      {i > 0 && ", "}
                      <a
                        href={hrefFor({ name: "person", id: person.id })}
                        className="transition-colors hover:text-primary"
                      >
                        {person.name}
                      </a>
                    </span>
                  ))
                : r.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3.5">
        <span className="mr-1 self-center text-[11px] font-semibold tracking-[0.1em] text-ink-dim/80 uppercase">
          Elsewhere
        </span>
        {detail.imdb_id && (
          <a
            href={`https://www.imdb.com/title/${detail.imdb_id}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/70 transition-colors duration-150 hover:border-[#f5c518]/60 hover:text-[#f5c518]"
          >
            IMDb
            <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
        <a
          href={`https://www.themoviedb.org/${type}/${detail.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/70 transition-colors duration-150 hover:border-primary/60 hover:text-primary"
        >
          TMDB
          <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>
    </div>
  );
}

/* ---------------------------------- cast ---------------------------------- */

const CREW_ORDER = [
  "Directing",
  "Writing",
  "Production",
  "Sound",
  "Camera",
  "Art",
  "Editing",
  "Visual Effects",
  "Costume & Make-Up",
];

function FullCast({ credits }: { credits: Credits }) {
  const cast = credits.cast ?? [];
  const crew = credits.crew ?? [];

  const byDept = useMemo(() => {
    const map = new Map<string, { id: number; name: string; job: string }[]>();
    for (const c of crew) {
      const dept = c.department ?? "Crew";
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept)!.push(c);
    }
    return [...map.entries()].sort((a, b) => {
      const ia = CREW_ORDER.indexOf(a[0]);
      const ib = CREW_ORDER.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [crew]);

  if (cast.length === 0 && byDept.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface p-5">
      <h4 className="text-[11px] font-bold tracking-[0.14em] text-white/50 uppercase">
        Full cast &amp; crew
      </h4>
      <div className="styled-scrollbar mt-4 max-h-[380px] overflow-y-auto pr-2">
        {cast.length > 0 && (
          <ul className="space-y-1">
            {cast.map((c) => (
              <li key={`c-${c.id}-${c.character ?? ""}`} className="flex items-center gap-3">
                <Img
                  src={profile(c.profile_path)}
                  alt=""
                  fallbackTitle={c.name}
                  className="size-9 shrink-0 rounded-full object-cover ring-1 ring-white/10"
                />
                <a
                  href={hrefFor({ name: "person", id: c.id })}
                  className="w-32 shrink-0 truncate text-[13px] font-semibold text-foreground transition-colors hover:text-primary md:w-44"
                >
                  {c.name}
                </a>
                <span className="min-w-0 flex-1 truncate text-xs text-ink-dim">
                  {c.character || "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {byDept.map(([dept, people]) => (
          <div key={dept} className="mt-5 first:mt-0">
            <p className="mb-2 text-[11px] font-bold tracking-[0.12em] text-primary/80 uppercase">
              {dept}
            </p>
            <ul className="space-y-1">
              {people.map((c, i) => (
                <li
                  key={`${dept}-${c.id}-${c.job}-${i}`}
                  className="flex items-center gap-3 text-xs"
                >
                  <span className="w-32 shrink-0 truncate text-[13px] font-medium text-foreground/90 md:w-44">
                    {c.name}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink-dim">{c.job}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function Cast({ id, type }: { id: number; type: "movie" | "tv" }) {
  const q = useTmdb<Credits>(`${type}/${id}/credits`);
  const [showAll, setShowAll] = useState(false);
  const allCast = q.data?.cast ?? [];
  const cast = allCast.slice(0, 12);
  const totalPeople = allCast.length + (q.data?.crew?.length ?? 0);
  if (allCast.length === 0 && (q.data?.crew?.length ?? 0) === 0) return null;
  return (
    <section aria-label="Cast">
      <h3 className="mb-4 text-[12px] font-bold tracking-[0.14em] text-white/60 uppercase">
        Cast
        <span className="ml-2.5 text-[11px] font-medium normal-case tracking-normal text-ink-dim/70">
          tap a face for their best work
        </span>
      </h3>
      <Rail label="cast" ariaLabel="Cast members">
        {cast.map((c) => (
          <a
            key={`${c.id}-${c.character}`}
            href={hrefFor({ name: "person", id: c.id })}
            className="w-[104px] shrink-0 text-center transition-transform duration-200 hover:scale-[1.04] md:w-[116px]"
            aria-label={`${c.name} — profile and credits`}
          >
            <Img
              src={profile(c.profile_path)}
              alt={c.name}
              fallbackTitle={c.name}
              className="mx-auto aspect-square w-[92px] rounded-full object-cover ring-1 ring-white/10 transition-shadow duration-200 hover:ring-primary/70 md:w-[104px]"
            />
            <p className="mt-2.5 truncate text-[13px] font-semibold">{c.name}</p>
            <p className="truncate text-xs text-ink-dim">{c.character}</p>
          </a>
        ))}
      </Rail>
      {totalPeople > cast.length && (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-semibold text-white/80 transition-colors duration-150 hover:border-white/25 hover:text-white"
          >
            <Clapperboard className="size-4 text-primary/80" aria-hidden />
            {showAll ? "Hide full cast & crew" : `Full cast & crew (${totalPeople})`}
            <ChevronDown
              className={`size-4 transition-transform duration-200 ${showAll ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
          {showAll && (
            <div className="mt-4">
              <FullCast credits={q.data!} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ------------------------------ tv episodes ------------------------------- */

function Episodes({
  detail,
  seasonNo,
  onSeasonChange,
}: {
  detail: TvDetail;
  seasonNo: number;
  onSeasonChange: (n: number) => void;
}) {
  const id = detail.id;
  const seasons = (detail.seasons ?? []).filter((s) => s.episode_count > 0);
  const q = useTmdb<TvSeason>(`tv/${id}/season/${seasonNo}`, {}, useDetailStaleTime());
  const progress = useReelivo((s) => s.progress);
  const lastEpisode = useReelivo((s) => s.lastEpisode[id]);
  const setLastEpisode = useReelivo((s) => s.setLastEpisode);
  const win = useMemo(() => weekWindow(), []);

  const episodes = q.data?.episodes ?? [];

  // collapse long seasons again when a different season is selected (render-adjust)
  const [expanded, setExpanded] = useState(false);
  const [prevSeason, setPrevSeason] = useState(seasonNo);
  if (seasonNo !== prevSeason) {
    setPrevSeason(seasonNo);
    setExpanded(false);
  }

  const EPISODE_CAP = 10;
  const shown = expanded ? episodes : episodes.slice(0, EPISODE_CAP);

  return (
    <section aria-label="Episodes">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-[12px] font-bold tracking-[0.14em] text-white/60 uppercase">
          Episodes
        </h3>
        <label className="flex items-center gap-2 text-xs text-ink-dim">
          Season
          <select
            value={seasonNo}
            onChange={(e) => onSeasonChange(Number(e.target.value))}
            className="rounded-lg border border-white/10 bg-surface-2 px-2 py-1.5 text-xs text-foreground outline-none focus-visible:border-primary"
            aria-label="Season"
          >
            {seasons.map((s) => (
              <option key={s.id} value={s.season_number}>
                {s.season_number === 0 ? "Specials" : `Season ${s.season_number}`}
                {` (${s.episode_count})`}
              </option>
            ))}
          </select>
        </label>
      </div>

      {q.isPending ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <StillSkeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorNote onRetry={() => q.refetch()} />
      ) : (
        <ol className="space-y-2">
          {shown.map((ep: TvEpisode) => {
            const entry = progress[progressKey(id, "tv", ep.season_number, ep.episode_number)];
            const pct =
              entry && entry.duration > 0
                ? Math.min(100, Math.round((entry.timestamp / entry.duration) * 100))
                : 0;
            const watched = pct >= 95;
            const isResume =
              lastEpisode?.season === ep.season_number && lastEpisode?.episode === ep.episode_number;
            /* "new this week" — episode airs (or aired) inside the current Mon–Sun window */
            const airDate = ep.air_date ?? "";
            const inWeek = airDate >= win.gte && airDate <= win.lte;
            const airBadge = inWeek
              ? airDate === win.today
                ? "Airs today"
                : airDate > win.today
                  ? `Airs ${new Date(`${airDate}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" })}`
                  : "New episode"
              : null;
            const open = () => {
              setLastEpisode(id, ep.season_number, ep.episode_number);
              navigate(
                hrefFor({
                  name: "play",
                  type: "tv",
                  id,
                  season: ep.season_number,
                  episode: ep.episode_number,
                })
              );
            };
            return (
              <li key={ep.id}>
                <div
                  role="link"
                  tabIndex={0}
                  onClick={open}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") open();
                  }}
                  className="group flex cursor-pointer items-center gap-4 rounded-xl border border-transparent p-3 transition-colors duration-150 hover:border-white/[0.08] hover:bg-surface"
                >
                  <span className="tabular w-6 shrink-0 text-center text-sm text-ink-dim">
                    {ep.episode_number}
                  </span>
                  <div className="relative w-[128px] shrink-0 overflow-hidden rounded-lg bg-surface-2 md:w-[156px]">
                    <Img
                      src={still(ep.still_path, "w300")}
                      alt=""
                      fallbackTitle={ep.name}
                      className="aspect-video w-full object-cover"
                    />
                    <span className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                      <span className="grid size-9 place-items-center rounded-full bg-white text-black">
                        <Play className="ml-0.5 size-4 fill-current" aria-hidden />
                      </span>
                    </span>
                    {pct > 0 && !watched && (
                      <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25">
                        <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[14px] font-semibold">
                      <span className="min-w-0 truncate">{ep.name}</span>
                      {watched && (
                        <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-ink-dim uppercase">
                          Watched
                        </span>
                      )}
                      {isResume && !watched && (
                        <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-primary-foreground uppercase">
                          Resume
                        </span>
                      )}
                      {airBadge && !watched && !isResume && (
                        <span className="shrink-0 rounded-full border border-primary/60 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-primary uppercase">
                          {airBadge}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-dim">
                      {airLabel(ep.air_date)}
                      {ep.runtime ? ` · ${fmtRuntime(ep.runtime)}` : ""}
                    </p>
                    {ep.overview && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-dim/85">
                        {ep.overview}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {!q.isPending && episodes.length > EPISODE_CAP && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] font-semibold text-white/80 transition-colors duration-150 hover:border-white/25 hover:text-white"
        >
          <Clapperboard className="size-4 text-primary/80" aria-hidden />
          {expanded ? "Show fewer episodes" : `Show all ${episodes.length} episodes`}
          <ChevronDown
            className={`size-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
      )}
    </section>
  );
}

/* -------------------------------- main view ------------------------------- */

export function DetailView({ type, id }: { type: "movie" | "tv"; id: number }) {
  const stale = useDetailStaleTime();
  const detail = useTmdb<Detail>(`${type}/${id}`, {}, stale);
  const credits = useTmdb<Credits>(`${type}/${id}/credits`, {}, stale);
  const recs = useTmdb<Paged<MediaItem>>(`${type}/${id}/recommendations`);
  const prefetch = usePrefetchDetail();
  const pushRecent = useReelivo((s) => s.pushRecent);
  const [seasonNo, setSeasonNo] = useState(1);

  const tvDetail = type === "tv" ? (detail.data as TvDetail | undefined) : undefined;

  useEffect(() => {
    if (detail.data) {
      pushRecent(toSavedItem(detail.data as unknown as MediaItem, type));
      prefetch(type, id);
    }
  }, [detail.data?.id, type]);

  const tvId = tvDetail?.id;
  const [prevTvId, setPrevTvId] = useState<number | undefined>(undefined);
  if (tvId !== prevTvId) {
    // reset the season selection when the show changes (render-adjust pattern)
    setPrevTvId(tvId);
    if (tvDetail?.seasons?.length) {
      const first = tvDetail.seasons.find((s) => s.season_number > 0) ?? tvDetail.seasons[0];
      setSeasonNo(first.season_number);
    }
  }

  useEffect(() => {
    if (detail.data) document.title = `${nameOf(detail.data)} — Reelivo`;
    return () => {
      document.title = "Reelivo — what to watch tonight";
    };
  }, [detail.data]);

  if (detail.isPending) {
    return (
      <div aria-busy>
        <StillSkeleton className="h-[42vh] min-h-[300px] w-full" />
        <div className="mx-auto max-w-[1400px] 2xl:max-w-[1660px] px-4 md:px-8">
          <div className="-mt-24 flex flex-col gap-6 md:flex-row md:items-end">
            <StillSkeleton className="h-[192px] w-32 rounded-xl md:h-[336px] md:w-[224px]" />
            <div className="flex-1 space-y-3 pb-2">
              <StillSkeleton className="h-9 w-2/3" />
              <StillSkeleton className="h-4 w-1/3" />
              <StillSkeleton className="h-12 w-64 rounded-lg" />
            </div>
          </div>
          <div className="mt-10 grid gap-8 md:grid-cols-[1fr_340px]">
            <div className="space-y-3">
              <StillSkeleton className="h-4 w-full" />
              <StillSkeleton className="h-4 w-5/6" />
              <StillSkeleton className="h-4 w-2/3" />
            </div>
            <StillSkeleton className="h-48 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-40">
        <ErrorNote onRetry={() => detail.refetch()} />
      </div>
    );
  }

  const d = detail.data;
  const recItems = (recs.data?.results ?? [])
    .filter((i) => (i.media_type ? i.media_type !== "person" : true) && !i.adult)
    .slice(0, 12);

  return (
    <article className="pb-16">
      {/* backdrop */}
      <div className="grain relative h-[42vh] min-h-[280px] w-full overflow-hidden md:h-[52vh]">
        <Img
          src={still(d.backdrop_path, "original") ?? poster(d.poster_path, "w780")}
          alt={`${nameOf(d)} — backdrop`}
          fallbackTitle={nameOf(d)}
          className="kenburns h-full w-full object-cover object-top"
          sizesHint="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-black/10" />
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent" />
      </div>

      <div className="mx-auto max-w-[1400px] 2xl:max-w-[1660px] px-4 md:px-8">
        <div className="relative z-10 -mt-24 flex flex-col gap-6 md:-mt-32 md:flex-row md:items-end">
          <div className="w-32 shrink-0 md:w-[224px]">
            <Img
              src={poster(d.poster_path, "w342")}
              alt={`${nameOf(d)} — poster`}
              fallbackTitle={nameOf(d)}
              className="aspect-[2/3] w-full rounded-xl object-cover shadow-[0_20px_60px_rgba(0,0,0,0.65)] ring-1 ring-white/10"
            />
          </div>
          <TitleBlock detail={d} type={type} id={id} />
        </div>

        <div className="mt-10 grid gap-10 md:grid-cols-[1fr_340px]">
          <div className="min-w-0 space-y-10">
            <section aria-label="Overview">
              <h3 className="mb-3 text-[12px] font-bold tracking-[0.14em] text-white/60 uppercase">
                The story
              </h3>
              {d.overview ? (
                <p className="max-w-2xl text-[15px] leading-relaxed text-foreground/90">
                  {d.overview}
                </p>
              ) : (
                <p className="max-w-2xl text-sm text-ink-dim">
                  No story on file yet — {dek(d.overview) || "the reel is still in the lab."}
                </p>
              )}
            </section>

            {type === "movie" && (d as MovieDetail).belongs_to_collection && (
              <CollectionStrip collection={(d as MovieDetail).belongs_to_collection!} />
            )}

            <Cast id={id} type={type} />

            {type === "tv" && tvDetail && (
              <Episodes detail={tvDetail} seasonNo={seasonNo} onSeasonChange={setSeasonNo} />
            )}

            <ReviewsSection id={id} type={type} />

            {recItems.length > 0 && (
              <section aria-label="More like this">
                <h3 className="mb-4 text-[12px] font-bold tracking-[0.14em] text-white/60 uppercase">
                  More like this
                </h3>
                {recs.isFetching ? (
                  <RailSkeleton />
                ) : (
                  <Rail label="recommendations" ariaLabel="More like this">
                    {recItems.map((i) => (
                      <StillCard
                        key={`${i.id}`}
                        item={i}
                        type={(i.media_type as "movie" | "tv") ?? type}
                      />
                    ))}
                  </Rail>
                )}
              </section>
            )}
          </div>

          <aside className="space-y-6 md:sticky md:top-24 md:self-start">
            <ProviderGroups id={id} type={type} />
            <Facts detail={d} type={type} credits={credits.data} />
            {type === "tv" && tvDetail?.number_of_episodes ? (
              <p className="px-1 text-xs leading-relaxed text-ink-dim">
                Last aired {dateOf({ release_date: tvDetail.last_air_date ?? "", first_air_date: "" })}
              </p>
            ) : null}
          </aside>
        </div>
      </div>
    </article>
  );
}
