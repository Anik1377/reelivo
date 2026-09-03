"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { ArrowRight, Info, Layers, Play, X } from "lucide-react";
import { hrefFor, navigate, tmdbFetch, useTmdb } from "@/lib/hooks";
import { continueEntries, useReelivo } from "@/lib/store";
import { DIRECTORS, FRANCHISES } from "@/lib/curated";
import {
  airLabel,
  dateOf,
  dek,
  poster,
  score,
  still,
  titleOf,
  typeOf,
  uniqueById,
  weekWindow,
  yearOf,
  genreNames,
  profile as profileUrl,
} from "@/lib/format";
import type { CollectionDetail, MediaItem, Paged, PersonDetail, ProviderEntry, ProvidersList, TrendingPersons } from "@/lib/tmdb-types";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  EmptyNote,
  ErrorNote,
  Img,
  RailSkeleton,
  Score,
  SectionHead,
  StillSkeleton,
  useMounted,
  usePrefersReducedMotion,
} from "../bits";
import { Rail, StillCard, SaveButton, toSavedItem } from "../media";
import { SERVICE_GROUPS } from "./services";

/* --------------------------- hero (rotating) ------------------------------ */

const HERO_SLIDES = 5;
const HERO_INTERVAL = 8500;

function HeroSlide({
  item,
  rank,
  active,
}: {
  item: MediaItem;
  rank: number;
  active: boolean;
}) {
  const type = typeOf(item);
  const title = titleOf(item);

  return (
    <div
      className={`absolute inset-0 transition-opacity duration-700 ease-out ${
        active ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!active}
      role="group"
      aria-roledescription="slide"
      aria-label={`Nº${rank} trending: ${title}`}
    >
      <Img
        src={still(item.backdrop_path, "original") ?? poster(item.poster_path, "w780")}
        alt=""
        fallbackTitle={title}
        className={`absolute inset-0 h-full w-full object-cover object-top ${active ? "kenburns" : ""}`}
        sizesHint="100vw"
      />
      {/* functional scrims — legibility, not decoration */}
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-black/5" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/70 to-transparent" />

      <div className="absolute inset-x-0 bottom-0">
        <div className="mx-auto max-w-[1400px] px-4 pb-9 md:px-8 md:pb-14 2xl:max-w-[1720px]">
          <div className="max-w-2xl">
            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-bold uppercase tracking-[0.18em]">
              <span className="text-primary">Nº{rank} trending this week</span>
              <span aria-hidden className="text-white/25">·</span>
              <span className="text-white/60">{type === "movie" ? "Film" : "Series"}</span>
            </p>
            <h1 className="display mt-2.5 text-[clamp(30px,5.5vw,62px)] leading-[1.02] text-white text-balance">
              {title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-white/70">
              <span className="tabular">{yearOf(item)}</span>
              {item.genre_ids ? (
                <>
                  <span aria-hidden className="text-white/25">·</span>
                  <span>{genreNames(item.genre_ids, 3)}</span>
                </>
              ) : null}
              <Score value={item.vote_average} className="text-[13px]" />
              <span className="rounded bg-primary px-1.5 py-px text-[9.5px] font-bold tracking-[0.14em] text-primary-foreground">
                FREE
              </span>
            </div>
            {item.overview ? (
              <p className="mt-3.5 line-clamp-3 max-w-xl text-[14.5px] leading-relaxed text-white/75">
                {dek(item.overview)}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                tabIndex={active ? 0 : -1}
                onClick={() => navigate(hrefFor({ name: "play", type, id: item.id }))}
                className="glow-primary inline-flex h-12 items-center gap-2 rounded-lg bg-white px-6 text-[14.5px] font-bold text-black transition-all duration-150 hover:-translate-y-0.5 hover:bg-white/90 active:translate-y-0 active:scale-[0.98]"
              >
                <Play className="size-4.5 fill-current" aria-hidden />
                Watch Free
              </button>
              <button
                type="button"
                tabIndex={active ? 0 : -1}
                onClick={() => navigate(hrefFor({ name: "detail", type, id: item.id }))}
                className="inline-flex h-12 items-center gap-2 rounded-lg bg-white/15 px-5 text-[14.5px] font-semibold text-white backdrop-blur-sm transition-colors duration-150 hover:bg-white/25"
              >
                <Info className="size-4.5" aria-hidden />
                Details
              </button>
              <span tabIndex={active ? 0 : -1} className="inline-flex">
                <SaveButton item={item} type={type} />
              </span>
            </div>
            <p className="mt-2.5 text-[11.5px] text-white/40">
              Free stream · ad-supported · no account needed
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroCarousel({ items }: { items: MediaItem[] }) {
  const slides = items
    .filter((i) => i.backdrop_path && i.overview)
    .slice(0, HERO_SLIDES);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const active = Math.min(index, slides.length - 1);

  useEffect(() => {
    if (paused || reducedMotion || slides.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), HERO_INTERVAL);
    return () => clearInterval(t);
  }, [paused, reducedMotion, slides.length]);

  if (slides.length === 0) return null;

  const step = (dir: 1 | -1) =>
    setIndex((i) => (i + dir + slides.length) % slides.length);

  /* touch swipe — a horizontal drag flips slides on phones; vertical scroll wins ties */
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || slides.length < 2) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      step(dx < 0 ? 1 : -1);
    }
  };

  return (
    <section
      className="grain anim-rise relative h-[68vh] min-h-[440px] max-h-[780px] w-full touch-pan-y overflow-hidden md:h-[76vh] 2xl:min-h-[560px] 2xl:max-h-[900px]"
      aria-roledescription="carousel"
      aria-label="Trending this week — use left and right arrows to change slide"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          step(1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          step(-1);
        }
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {slides.map((item, i) => (
        <HeroSlide
          key={`${item.id}-${item.media_type ?? ""}`}
          item={item}
          rank={items.indexOf(item) + 1}
          active={i === active}
        />
      ))}

      {/* slide indicators */}
      <div className="absolute right-4 bottom-9 z-10 flex items-center gap-2 md:right-8 md:bottom-14">
        {slides.map((s, i) => (
          <button
            key={`${s.id}-ind`}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show “${titleOf(s)}”`}
            aria-current={i === active}
            className={`h-1 rounded-full transition-all duration-300 ${
              i === active ? "w-7 bg-primary" : "w-3 bg-white/30 hover:bg-white/60"
            }`}
          />
        ))}
      </div>
    </section>
  );
}

/* --------------------------------- top 10 --------------------------------- */

function TopTen({ items }: { items: MediaItem[] }) {
  return (
    <section aria-label="Top 10 this week">
      <SectionHead
        kicker="The chart"
        title="Top 10 this week"
        aside={<span className="text-xs text-ink-dim">Across films &amp; series</span>}
      />
      <Rail label="top 10" ariaLabel="Top 10 most watched this week">
        {items.map((item, i) => {
          const type = typeOf(item);
          return (
            <article key={`${item.id}-${item.media_type}`} className="flex shrink-0 items-end">
              <span
                aria-hidden
                className="display -mr-3.5 mb-9 select-none text-[88px] leading-none text-transparent md:-mr-5 md:mb-10 md:text-[112px]"
                style={{ WebkitTextStroke: "2px rgba(255,255,255,0.22)" }}
              >
                {i + 1}
              </span>
              <div className="relative w-[200px] md:w-[264px]">
                <StillCard
                  item={item}
                  type={type}
                  fluid
                  showScore={false}
                  preview
                  sub={`${type === "movie" ? "Film" : "Series"} · ${yearOf(item)}`}
                />
              </div>
            </article>
          );
        })}
      </Rail>
    </section>
  );
}

/* --------------------------- continue watching ---------------------------- */

function ContinueStrip() {
  const mounted = useMounted();
  const progress = useReelivo((s) => s.progress);
  const clearProgress = useReelivo((s) => s.clearProgress);
  const profile = useReelivo((s) => s.profiles.find((p) => p.id === s.activeProfileId));
  const entries = mounted ? continueEntries(progress) : [];

  if (entries.length === 0) return null;

  /* A small, human touch: the greeting rides on the resume queue like an
   * usher, not a dashboard widget. Hours 5–12 morning, 12–18 afternoon. */
  const hour = mounted ? new Date().getHours() : 12;
  const timeWord = hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <section aria-label="Continue watching">
      <SectionHead
        title={profile ? `${timeWord}, ${profile.name}` : "Continue watching"}
        aside={<span className="text-xs text-ink-dim">Picks up where you left off</span>}
      />
      <Rail label="continue watching" ariaLabel="Continue watching">
        {entries.map((p) => {
          const pct = Math.min(96, Math.round((p.timestamp / p.duration) * 100));
          const minsLeft = Math.max(1, Math.round((p.duration - p.timestamp) / 60));
          return (
            <article key={p.key} className="group w-[240px] shrink-0 snap-start md:w-[300px]">
              <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-surface-2 ring-1 ring-white/[0.06] transition-all duration-200 group-hover:ring-white/25">
                <button
                  type="button"
                  aria-label={`Resume ${p.title}`}
                  onClick={() =>
                    navigate(
                      hrefFor({
                        name: "play",
                        type: p.type,
                        id: p.id,
                        season: p.season,
                        episode: p.episode,
                      })
                    )
                  }
                  className="absolute inset-0 h-full w-full cursor-pointer text-left"
                >
                  <Img
                    src={still(p.backdrop, "w780") ?? poster(p.poster, "w342")}
                    alt=""
                    fallbackTitle={p.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                  />
                  <span className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                    <span className="grid size-12 place-items-center rounded-full bg-white text-black shadow-[0_8px_28px_rgba(0,0,0,0.55)]">
                      <Play className="ml-0.5 size-5 fill-current" aria-hidden />
                    </span>
                  </span>
                  <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/20">
                    <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${p.title} from Continue watching`}
                  onClick={() => clearProgress(p.key)}
                  className="absolute top-2 right-2 z-10 hidden size-7 place-items-center rounded-full bg-black/70 text-white/80 opacity-0 transition-all duration-150 hover:text-white focus-visible:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 md:grid"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
              <div className="mt-2.5">
                <p className="truncate text-[13.5px] font-semibold">{p.title}</p>
                <p className="mt-0.5 truncate text-xs text-ink-dim">
                  {p.type === "tv" && p.season ? `S${p.season} E${p.episode} · ` : ""}
                  <span className="tabular">{minsLeft} min left</span>
                </p>
              </div>
            </article>
          );
        })}
      </Rail>
    </section>
  );
}

/* ------------------------------ journal rail ------------------------------ */

function JournalRail() {
  const mounted = useMounted();
  const recents = useReelivo((s) => s.recents);
  if (!mounted || recents.length === 0) return null;
  return (
    <section aria-label="Recently viewed">
      <SectionHead
        title="Recently viewed"
        aside={
          <a
            href="#/watchlist"
            className="text-[13px] text-ink-dim transition-colors hover:text-primary"
          >
            Your list
          </a>
        }
      />
      <Rail label="recently viewed" ariaLabel="Recently opened titles">
        {recents.map((r) => (
          <StillCard
            key={`${r.type}-${r.id}`}
            item={{
              id: r.id,
              title: r.title,
              poster_path: r.poster,
              backdrop_path: r.backdrop,
              release_date: r.year,
              vote_average: r.rating,
            }}
            type={r.type}
            sub={`${r.year} · ${r.type === "movie" ? "Film" : "Series"}`}
          />
        ))}
      </Rail>
    </section>
  );
}

/* --------------------------- because you saved ---------------------------- */

/** Personalisation: recommendations seeded by the most recent watchlist save. */
function BecauseYouSaved() {
  const mounted = useMounted();
  const watchlist = useReelivo((s) => s.watchlist);
  const anchor = mounted ? watchlist[0] : undefined;

  const recs = useTmdb<Paged<MediaItem>>(
    anchor ? `${anchor.type}/${anchor.id}/recommendations` : null
  );

  if (!anchor) return null;

  const savedIds = new Set(watchlist.map((w) => w.id));
  const items = uniqueById(
    (recs.data?.results ?? []).filter(
      (i) => !i.adult && (i.backdrop_path || i.poster_path) && !savedIds.has(i.id)
    )
  ).slice(0, 14);

  if (items.length === 0) return null;

  return (
    <section aria-label={`More like ${anchor.title}`}>
      <SectionHead
        title={`Because you saved ${anchor.title}`}
        aside={
          <a
            href="#/watchlist"
            className="text-[13px] text-ink-dim transition-colors hover:text-primary"
          >
            Your list
          </a>
        }
      />
      {recs.isFetching ? (
        <RailSkeleton />
      ) : (
        <Rail label="because you saved" ariaLabel={`More like ${anchor.title}`}>
          {items.map((i) => (
            <StillCard
              key={i.id}
              item={i}
              type={(i.media_type as "movie" | "tv") ?? anchor.type}
              preview
            />
          ))}
        </Rail>
      )}
    </section>
  );
}

/* ---------------------------- where to watch ------------------------------ */

/* Single source of truth lives in services.tsx — the home strip shows the
 * majors only; the full grouped catalogue (28 platforms) is on the page. */
const SERVICES = SERVICE_GROUPS[0].services;

function ServiceTile({
  entry,
  label,
}: {
  entry?: ProviderEntry;
  label: string;
}) {
  const setServiceFocus = useReelivo((s) => s.setServiceFocus);
  return (
    <a
      href="#/services"
      onClick={() => setServiceFocus(entry?.provider_id ?? null)}
      className="group flex min-w-[150px] shrink-0 snap-start items-center gap-3 rounded-xl border border-white/[0.07] bg-surface px-4 py-3 transition-colors duration-150 hover:border-white/25 hover:bg-surface-2"
      aria-label={`Browse what's on ${label}`}
    >
      {entry?.logo_path ? (
        <Img
          src={`https://image.tmdb.org/t/p/w92${entry.logo_path}`}
          alt=""
          fallbackTitle={label}
          className="size-8 shrink-0 rounded-md object-contain"
        />
      ) : (
        <span className="display grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-sm">
          {label.slice(0, 1)}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-foreground">{label}</span>
        <span className="block text-[11px] text-ink-dim">See what's on →</span>
      </span>
    </a>
  );
}

function ServiceStrip() {
  const mounted = useMounted();
  const region = useReelivo((s) => s.region);
  // respect the region picked on the services/detail pages (SSR stays US-default)
  const activeRegion = mounted ? region : "US";
  const providers = useTmdb<ProvidersList>("watch/providers/movie", {
    watch_region: activeRegion,
  });
  const byId = new Map((providers.data?.results ?? []).map((p) => [p.provider_id, p]));

  return (
    <section aria-label="Where to watch">
      <SectionHead
        title="Browse by service"
        aside={
          <span className="flex items-center gap-2 text-[13px] text-ink-dim">
            <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-px text-[10px] font-bold tracking-wider text-ink-dim">
              {activeRegion}
            </span>
            <a
              href="#/services"
              className="transition-colors hover:text-primary"
            >
              All services
            </a>
          </span>
        }
      />
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        {SERVICES.map((s) => (
          <ServiceTile key={s.id} entry={byId.get(s.id)} label={s.label} />
        ))}
      </div>
    </section>
  );
}

/* --------------------------- premiering this week -------------------------- */

function PremieringRail() {
  const win = useMemo(() => weekWindow(), []);
  const shows = useTmdb<Paged<MediaItem>>("discover/tv", {
    "first_air_date.gte": win.gte,
    "first_air_date.lte": win.lte,
    sort_by: "popularity.desc",
  });

  const items = uniqueById((shows.data?.results ?? []).filter((i) => i.backdrop_path || i.poster_path)).slice(0, 14);

  if (shows.data && items.length === 0) return null;

  const span = `Week of ${airLabel(win.gte)}`;

  return (
    <section aria-label="Premiering this week">
      <SectionHead
        title="New series this week"
        aside={<span className="text-xs text-ink-dim">First airs · {span}</span>}
      />
      {shows.isLoading ? (
        <RailSkeleton />
      ) : shows.isError ? (
        <ErrorNote onRetry={() => shows.refetch()} />
      ) : (
        <Rail label="premiering this week" ariaLabel="Series premiering this week">
          {items.map((i) => (
            <StillCard
              key={i.id}
              item={i}
              type="tv"
              preview
              sub={`${(i.first_air_date ?? "") >= win.today ? "Premieres" : "Premiered"} ${dateOf(i)}`}
            />
          ))}
        </Rail>
      )}
    </section>
  );
}

/* --------------------------- trending people ------------------------------- */

/** Circular-avatar rail of the week's trending people — deep-links to person pages. */
function TrendingPeopleRail() {
  const q = useTmdb<TrendingPersons>("trending/person/week");
  const people = (q.data?.results ?? []).filter((p) => p.profile_path).slice(0, 12);
  if (q.isPending) return null;
  if (people.length === 0) return null;

  const deptLabel = (p: (typeof people)[number]) => p.known_for_department ?? "";
  const bestKnown = (p: (typeof people)[number]) => {
    const kf = (p.known_for ?? [])
      .filter((k) => k.vote_count && k.vote_count > 100)
      .sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))[0];
    return kf ? (kf.title ?? kf.name) : null;
  };

  return (
    <section aria-label="Trending people">
      <SectionHead
        kicker="Faces"
        title="Faces of the week"
        aside={<span className="text-xs text-ink-dim">Trending people on TMDB</span>}
      />
      {q.isError ? (
        <ErrorNote onRetry={() => q.refetch()} />
      ) : (
        <Rail label="trending people" ariaLabel="People trending this week">
          {people.map((p, idx) => (
            <HoverCard key={p.id} openDelay={350} closeDelay={120}>
              <HoverCardTrigger asChild>
                <a
                  href={hrefFor({ name: "person", id: p.id, rank: idx + 1 })}
                  className="w-[104px] shrink-0 text-center transition-transform duration-200 hover:scale-[1.04] md:w-[116px]"
                  aria-label={`${p.name} — № ${idx + 1} trending this week, profile and credits`}
                >
                  <span className="relative mx-auto block w-[92px] md:w-[104px]">
                    <Img
                      src={`https://image.tmdb.org/t/p/w185${p.profile_path}`}
                      alt={p.name}
                      fallbackTitle={p.name}
                      className="aspect-square w-full rounded-full object-cover ring-1 ring-white/10 transition-shadow duration-200 hover:ring-primary/70"
                    />
                    <span
                      aria-hidden
                      className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full border border-primary/50 bg-black px-2 py-px text-[10px] font-bold tracking-wide text-primary tabular-nums"
                    >
                      №{idx + 1}
                    </span>
                  </span>
                  <p className="mt-3 truncate text-[13px] font-semibold">{p.name}</p>
                  <p className="truncate text-xs text-ink-dim">
                    {[deptLabel(p), bestKnown(p)].filter(Boolean).join(" · ")}
                  </p>
                </a>
              </HoverCardTrigger>
              <HoverCardContent
                side="top"
                align="center"
                sideOffset={12}
                role="group"
                aria-label={`${p.name} — trending person preview`}
                className="w-[264px] rounded-xl border-white/10 bg-surface/95 p-0 shadow-[0_30px_80px_rgba(0,0,0,0.8)] backdrop-blur-md"
              >
                <div className="flex items-center gap-3 p-3.5">
                  <Img
                    src={`https://image.tmdb.org/t/p/w185${p.profile_path}`}
                    alt=""
                    fallbackTitle={p.name}
                    className="size-14 shrink-0 rounded-full object-cover ring-1 ring-white/15"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-bold text-foreground">{p.name}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-ink-dim">
                      {[deptLabel(p), bestKnown(p)].filter(Boolean).join(" · ")}
                    </p>
                    <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold tracking-wide text-primary uppercase">
                      View profile
                      <ArrowRight className="size-3" aria-hidden />
                    </p>
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>
          ))}
        </Rail>
      )}
    </section>
  );
}

/* ------------------------------- collections ------------------------------- */

function CollectionsRail() {
  /* Each franchise card hydrates from its real TMDB collection — name, art and
   * film count are live data, the curation is only the id list. */
  const cols = useQueries({
    queries: FRANCHISES.map((f) => ({
      queryKey: ["tmdb", `collection/${f.id}`, {}] as const,
      queryFn: () => tmdbFetch<CollectionDetail>(`collection/${f.id}`),
      staleTime: 60 * 60 * 1000,
      retry: 1,
    })),
  });

  const loading = cols.some((q) => q.isPending);
  const ready = FRANCHISES.map((f, i) => ({ ref: f, data: cols[i]?.data })).filter(
    (x): x is { ref: typeof x.ref; data: CollectionDetail } => !!x.data?.id
  );

  return (
    <section aria-label="Collections">
      <SectionHead
        kicker="Collections"
        title="Franchises worth the marathon"
        aside={
          <span className="text-xs text-ink-dim">Complete runs, in release order</span>
        }
      />
      {loading ? (
        <RailSkeleton />
      ) : ready.length === 0 ? (
        <ErrorNote onRetry={() => cols.forEach((q) => q.refetch())} />
      ) : (
        <Rail label="collections" ariaLabel="Film franchises and boxsets">
          {ready.map(({ ref, data }) => (
            <a
              key={ref.id}
              href={hrefFor({ name: "collection", id: ref.id })}
              aria-label={`${data.name} — ${data.parts?.length ?? 0} titles`}
              className="group relative block w-[264px] shrink-0 snap-start overflow-hidden rounded-xl bg-surface-2 ring-1 ring-white/[0.06] transition-all duration-200 hover:ring-white/25 md:w-[312px]"
            >
              <div className="relative aspect-video w-full overflow-hidden">
                <Img
                  src={still(data.backdrop_path, "w780") ?? poster(data.poster_path, "w780")}
                  alt=""
                  fallbackTitle={data.name}
                  sizesHint="320px"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
                />
                <span
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent"
                />
                <span className="tabular absolute top-2.5 right-2.5 rounded-full border border-white/20 bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white/90 backdrop-blur-sm">
                  {data.parts?.length ?? 0} films
                </span>
                <div className="absolute inset-x-0 bottom-0 p-3.5">
                  <p className="kicker !text-[9.5px] text-primary/90">{ref.note}</p>
                  <p className="display mt-1 truncate text-[15.5px] text-white">{data.name}</p>
                </div>
              </div>
            </a>
          ))}
        </Rail>
      )}
    </section>
  );
}

/* --------------------------- director spotlight ---------------------------- */

function DirectorsRail() {
  const people = useQueries({
    queries: DIRECTORS.map((d) => ({
      queryKey: ["tmdb", `person/${d.id}`, {}] as const,
      queryFn: () => tmdbFetch<PersonDetail>(`person/${d.id}`),
      staleTime: 24 * 60 * 60 * 1000,
      retry: 1,
    })),
  });

  const loading = people.some((q) => q.isPending);
  const ready = DIRECTORS.map((d, i) => ({ ref: d, data: people[i]?.data })).filter(
    (x): x is { ref: typeof x.ref; data: PersonDetail } => !!x.data?.id
  );

  return (
    <section aria-label="Director spotlight">
      <SectionHead
        kicker="Director spotlight"
        title="Masters, ranked"
        aside={
          <span className="text-xs text-ink-dim">Their best direction, vote-ranked</span>
        }
      />
      {loading ? (
        <RailSkeleton />
      ) : ready.length === 0 ? (
        <ErrorNote onRetry={() => people.forEach((q) => q.refetch())} />
      ) : (
        <Rail label="directors" ariaLabel="Director spotlights">
          {ready.map(({ ref, data }) => (
            <a
              key={ref.id}
              href={hrefFor({ name: "director", id: ref.id })}
              aria-label={`${data.name} — best works`}
              className="group relative block w-[152px] shrink-0 snap-start overflow-hidden rounded-xl bg-surface-2 ring-1 ring-white/[0.06] transition-all duration-200 hover:ring-white/25 md:w-[168px]"
            >
              <div className="relative aspect-[3/4] w-full overflow-hidden">
                <Img
                  src={profileUrl(data.profile_path, "w185")}
                  alt=""
                  fallbackTitle={data.name}
                  sizesHint="168px"
                  className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.06]"
                />
                <span
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent"
                />
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <p className="truncate text-[13.5px] font-bold text-white">{data.name}</p>
                  <p className="mt-0.5 line-clamp-1 text-[10.5px] leading-snug text-white/60">
                    {ref.note}
                  </p>
                </div>
              </div>
            </a>
          ))}
        </Rail>
      )}
    </section>
  );
}

/* ---------------------------------- home ---------------------------------- */

export function HomeView() {
  const trending = useTmdb<Paged<MediaItem>>("trending/all/week");
  const nowPlaying = useTmdb<Paged<MediaItem>>("movie/now_playing");
  const onAir = useTmdb<Paged<MediaItem>>("tv/on_the_air");
  const praise = useTmdb<Paged<MediaItem>>("discover/movie", {
    sort_by: "vote_average.desc",
    "vote_count.gte": 2000,
    "vote_average.gte": 7.6,
    "primary_release_date.gte": "2020-01-01",
  });

  const items = uniqueById(
    (trending.data?.results ?? []).filter(
      (i) => (i.media_type === "movie" || i.media_type === "tv") && !i.adult
    )
  );
  const chart = items.slice(0, 10);

  return (
    <div className="pb-16">
      {trending.isLoading && (
        <div className="mx-auto px-4 pt-28 md:px-8" aria-hidden>
          <StillSkeleton className="h-[62vh] min-h-[420px] w-full" />
        </div>
      )}
      {trending.isError && (
        <div className="mx-auto max-w-2xl px-4 pt-40">
          <ErrorNote onRetry={() => trending.refetch()} />
        </div>
      )}
      <HeroCarousel items={items} />

      <div className="mx-auto max-w-[1400px] space-y-10 px-4 md:space-y-14 md:px-8 2xl:max-w-[1720px]">
        <div className="pt-10 md:pt-12">
          <ContinueStrip />
        </div>

        {chart.length > 0 && <TopTen items={chart} />}

        <CollectionsRail />

        <section aria-label="First runs">
          <SectionHead
            kicker="First runs"
            title="In cinemas now"
            aside={
              <a
                href="#/films"
                className="text-[13px] text-ink-dim transition-colors hover:text-primary"
              >
                All films
              </a>
            }
          />
          {nowPlaying.isLoading ? (
            <RailSkeleton />
          ) : nowPlaying.isError ? (
            <ErrorNote onRetry={() => nowPlaying.refetch()} />
          ) : (
            <Rail label="in cinemas" ariaLabel="Films in cinemas now">
              {uniqueById(nowPlaying.data?.results ?? [])
                .filter((i) => i.backdrop_path || i.poster_path)
                .slice(0, 14)
                .map((i) => (
                  <StillCard key={i.id} item={i} type="movie" preview sub={`${dateOf(i)} · Film`} />
                ))}
            </Rail>
          )}
        </section>

        <ServiceStrip />

        <section aria-label="New episodes">
          <SectionHead
            kicker="On air"
            title="Series with new episodes"
            aside={
              <a
                href="#/series"
                className="text-[13px] text-ink-dim transition-colors hover:text-primary"
              >
                All series
              </a>
            }
          />
          {onAir.isLoading ? (
            <RailSkeleton />
          ) : onAir.isError ? (
            <ErrorNote onRetry={() => onAir.refetch()} />
          ) : (
            <Rail label="new episodes" ariaLabel="Series with new episodes">
              {uniqueById(onAir.data?.results ?? [])
                .filter((i) => i.backdrop_path || i.poster_path)
                .slice(0, 14)
                .map((i) => (
                  <StillCard key={i.id} item={i} type="tv" preview sub={`${dateOf(i)} · Series`} />
                ))}
            </Rail>
          )}
        </section>

        <PremieringRail />

        <TrendingPeopleRail />

        <DirectorsRail />

        <section aria-label="The praise list">
          <SectionHead
            kicker="The praise list"
            title="Best of the decade so far"
            aside={<span className="text-xs text-ink-dim">By TMDB rating, 2,000+ votes</span>}
          />
          {praise.isLoading ? (
            <RailSkeleton />
          ) : praise.isError ? (
            <ErrorNote onRetry={() => praise.refetch()} />
          ) : (
            <Rail label="acclaimed" ariaLabel="Best of the decade so far">
              {uniqueById(praise.data?.results ?? [])
                .filter((i) => i.backdrop_path || i.poster_path)
                .slice(0, 14)
                .map((i) => (
                  <StillCard key={i.id} item={i} type="movie" preview />
                ))}
            </Rail>
          )}
        </section>

        <JournalRail />

        <BecauseYouSaved />

        {!trending.isLoading &&
          chart.length === 0 &&
          nowPlaying.isError &&
          onAir.isError &&
          praise.isError && <EmptyNote title="Nothing on the marquee" />}
      </div>
    </div>
  );
}
