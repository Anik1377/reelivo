"use client";

import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { tmdbFetch, useHashRoute } from "@/lib/hooks";
import { logo, uniqueById } from "@/lib/format";
import { useReelivo } from "@/lib/store";
import type { MediaItem, Paged, ProviderEntry, ProvidersList } from "@/lib/tmdb-types";
import { Chip, ErrorNote, Img, SectionHead, StillSkeleton } from "../bits";
import { StillCard } from "../media";

/* Platforms are hand-verified against TMDB's live /watch/providers list (ids are
 * TMDB's, so logos always render truthfully per region). Paramount+ used to be
 * id 531 — TMDB split it into Premium (2303) / Essential (2616) tiers and 531
 * vanished from the US list, which silently degraded the chip to a letter tile. */
export interface PlatformRef {
  id: number;
  label: string;
}

export interface ServiceGroup {
  kicker: string;
  note?: string;
  services: PlatformRef[];
}

export const SERVICE_GROUPS: ServiceGroup[] = [
  {
    kicker: "The majors",
    services: [
      { id: 8, label: "Netflix" },
      { id: 119, label: "Prime Video" },
      { id: 337, label: "Disney+" },
      { id: 1899, label: "Max" },
      { id: 15, label: "Hulu" },
      { id: 350, label: "Apple TV+" },
      { id: 2303, label: "Paramount+" },
      { id: 386, label: "Peacock" },
    ],
  },
  {
    kicker: "Free & ad-supported",
    note: "No subscription needed",
    services: [
      { id: 73, label: "Tubi" },
      { id: 300, label: "Pluto TV" },
      { id: 207, label: "The Roku Channel" },
      { id: 209, label: "PBS" },
    ],
  },
  {
    kicker: "Specialist & prestige",
    services: [
      { id: 283, label: "Crunchyroll" },
      { id: 526, label: "AMC+" },
      { id: 34, label: "MGM+" },
      { id: 43, label: "Starz" },
      { id: 520, label: "Discovery+" },
      { id: 257, label: "fuboTV" },
      { id: 99, label: "Shudder" },
      { id: 11, label: "MUBI" },
      { id: 258, label: "Criterion Channel" },
      { id: 151, label: "BritBox" },
    ],
  },
  {
    kicker: "India",
    note: "Pick the India region for full catalogs",
    services: [
      { id: 2336, label: "JioHotstar" },
      { id: 232, label: "Zee5" },
      { id: 237, label: "SonyLIV" },
      { id: 515, label: "MX Player" },
      { id: 309, label: "Sun NXT" },
      { id: 532, label: "aha" },
    ],
  },
];

export const SERVICES: PlatformRef[] = SERVICE_GROUPS.flatMap((g) => g.services);

const REGIONS = [
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" },
  { code: "BR", label: "Brazil" },
  { code: "MX", label: "Mexico" },
  { code: "IN", label: "India" },
  { code: "JP", label: "Japan" },
  { code: "KR", label: "South Korea" },
];

export function ServicesView() {
  const region = useReelivo((s) => s.region);
  const setRegion = useReelivo((s) => s.setRegion);
  const focus = useReelivo((s) => s.serviceFocus);
  const setFocus = useReelivo((s) => s.setServiceFocus);

  /* Deep links: #/services/{id} names one provider in the hash (Task-32 wave
   * 1-b router). The view reads the route itself — app.tsx mounts it bare —
   * and feeds it into the SAME focus/catalog store the chips use: the deep
   * linked chip gets a cyan ping (~2s) then a persistent subtle ring, walks
   * into view, and the catalogue below opens on that provider. Manual chip
   * clicks keep working exactly as before — the ring simply follows the hash
   * (it only shows on the deep linked chip while it is still the selected
   * provider, so picking another chip clears it with zero extra state). */
  const route = useHashRoute();
  const routeFocus = route.name === "services" && route.focus ? route.focus : null;

  useEffect(() => {
    if (routeFocus == null) return;
    setFocus(routeFocus); // opens that service's catalogue (existing store concept)
    /* one short beat: the router's own scroll-to-top (app-level effect) lands
     * first on in-app navigations, then the chip walks into view. Motion is
     * read here — this code only ever runs post-mount, in the browser. */
    const scrollT = setTimeout(() => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document
        .querySelector(`[data-service-id="${routeFocus}"]`)
        ?.scrollIntoView({
          block: "center",
          inline: "center",
          behavior: reduced ? "auto" : "smooth",
        });
    }, 120);
    return () => clearTimeout(scrollT);
  }, [routeFocus, setFocus]);

  const provider = focus ?? SERVICES[0].id;
  const providerLabel = SERVICES.find((s) => s.id === provider)?.label ?? "Service";

  const providersQ = useQuery<ProviderEntry[]>({
    queryKey: ["providers-region", region],
    queryFn: async () => {
      const data = await tmdbFetch<ProvidersList>("watch/providers/movie", {
        watch_region: region,
      });
      return data.results ?? [];
    },
    staleTime: 24 * 60 * 60 * 1000,
  });
  const byId = new Map((providersQ.data ?? []).map((p) => [p.provider_id, p]));

  return (
    <ServicesInner
      region={region}
      setRegion={setRegion}
      provider={provider}
      setProvider={setFocus}
      providerLabel={providerLabel}
      byId={byId}
      providersLoading={providersQ.isPending}
      ringId={routeFocus}
    />
  );
}

function ServicesInner({
  region,
  setRegion,
  provider,
  setProvider,
  providerLabel,
  byId,
  providersLoading,
  ringId,
}: {
  region: string;
  setRegion: (r: string) => void;
  provider: number;
  setProvider: (id: number | null) => void;
  providerLabel: string;
  byId: Map<number, ProviderEntry>;
  providersLoading: boolean;
  /** Deep-link highlight (wave 2-c): the provider the hash names, or null. */
  ringId: number | null;
}) {
  const [tab, setTab] = useState<"movie" | "tv">("movie");

  const q = useInfiniteQuery({
    queryKey: ["service", tab, provider, region],
    queryFn: ({ pageParam }) =>
      tmdbFetch<Paged<MediaItem>>(`discover/${tab}`, {
        with_watch_providers: String(provider),
        watch_region: region,
        sort_by: "popularity.desc",
        include_adult: "false",
        page: pageParam as number,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page < Math.min(last.total_pages, 15) ? last.page + 1 : undefined,
    staleTime: 5 * 60 * 1000,
  });

  const items = uniqueById((q.data?.pages ?? []).flatMap((p) => p.results).filter((i) => !i.adult));

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-24 md:px-8 md:pt-32 2xl:max-w-[1720px]">
      <SectionHead
        kicker="Where to watch"
        title="Browse by service"
        aside={
          <label className="flex items-center gap-2 text-xs text-ink-dim">
            Region
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="rounded-lg border border-white/10 bg-surface-2 px-2 py-1.5 text-xs text-foreground outline-none focus-visible:border-primary"
              aria-label="Watch region"
            >
              {REGIONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        }
      />
      <p className="mt-1 max-w-xl text-sm text-ink-dim">
        What's popular on each service right now, by region — {SERVICES.length} platforms
        tracked. Logos and catalogs follow the region you pick.
      </p>

      <div className="mt-7 space-y-6">
        {SERVICE_GROUPS.map((g) => (
          <section key={g.kicker} aria-label={g.kicker}>
            <div className="mb-2.5 flex items-baseline gap-3">
              <h3 className="kicker text-[11px] text-ink-dim">{g.kicker}</h3>
              {g.note && (
                <span className="text-[11px] text-ink-dim/55">{g.note}</span>
              )}
            </div>
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {g.services.map((s) => {
                const selected = s.id === provider;
                // ring only while the deep-linked chip is still the active pick
                const ringed = ringId === s.id && selected;
                return (
                  <button
                    key={s.id}
                    type="button"
                    data-service-id={s.id}
                    onClick={() => setProvider(s.id)}
                    aria-pressed={selected}
                    className={`relative flex shrink-0 items-center gap-2.5 rounded-xl border px-4 py-2.5 transition-colors duration-150 ${
                      selected
                        ? "border-primary/70 bg-primary/10 text-white"
                        : "border-white/[0.08] bg-white/[0.03] text-ink-dim hover:border-white/25 hover:text-white"
                    } ${ringed ? "ring-1 ring-primary/50" : ""}`}
                  >
                    {/* deep-link pulse: the built-in ping runs exactly twice
                      * (~2s), then falls back to this element's invisible base
                      * state — the persistent ring is the ring-1 above */}
                    {ringed && (
                      <span
                        aria-hidden
                        style={{ animationIterationCount: 2 }}
                        className="pointer-events-none absolute inset-0 animate-ping rounded-xl border-2 border-primary opacity-0 motion-reduce:hidden"
                      />
                    )}
                    <Img
                      src={logo(byId.get(s.id)?.logo_path)}
                      alt=""
                      fallbackTitle={s.label}
                      className="size-7 shrink-0 rounded-md object-contain"
                    />
                    <span className="text-[13px] font-semibold">{s.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        {providersLoading && (
          <span className="grid w-fit place-items-center text-ink-dim" aria-hidden>
            <Loader2 className="size-4 animate-spin" />
          </span>
        )}
      </div>

      <div className="mt-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 className="display text-xl tracking-tight">
            Popular on {providerLabel}{" "}
            <span className="tabular ml-1 align-middle text-xs font-sans font-semibold tracking-[0.14em] text-primary">
              {region}
            </span>
          </h2>
          <div className="flex gap-2" role="group" aria-label="Media type">
            <Chip selected={tab === "movie"} onClick={() => setTab("movie")}>
              Films
            </Chip>
            <Chip selected={tab === "tv"} onClick={() => setTab("tv")}>
              Series
            </Chip>
          </div>
        </div>

        {q.isPending ? (
          <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <StillSkeleton className="aspect-video w-full" />
                <StillSkeleton className="mt-2.5 h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : q.isError ? (
          <ErrorNote onRetry={() => q.refetch()} />
        ) : items.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-dim">
            {providerLabel} shows nothing here in {region} right now.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((i) => {
              const date = i.release_date || i.first_air_date;
              return (
                <StillCard
                  key={i.id}
                  item={i}
                  type={tab}
                  fluid
                  showScore={false}
                  sub={`${date ? date.slice(0, 4) : ""} · ${tab === "movie" ? "Film" : "Series"}`}
                />
              );
            })}
          </div>
        )}

        {q.hasNextPage && !q.isError && (
          <div className="mt-10 text-center">
            <button
              type="button"
              onClick={() => q.fetchNextPage()}
              disabled={q.isFetchingNextPage}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-white/10 px-6 text-sm font-semibold text-white transition-colors duration-150 hover:bg-white/20 disabled:opacity-60"
            >
              {q.isFetchingNextPage && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {q.isFetchingNextPage ? "Fetching" : "Load more"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
