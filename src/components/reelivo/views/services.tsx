"use client";

import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { tmdbFetch } from "@/lib/hooks";
import { logo, uniqueById } from "@/lib/format";
import { useReelivo } from "@/lib/store";
import type { MediaItem, Paged, ProviderEntry, ProvidersList } from "@/lib/tmdb-types";
import { Chip, ErrorNote, Img, SectionHead, StillSkeleton } from "../bits";
import { StillCard } from "../media";

export const SERVICES: { id: number; label: string }[] = [
  { id: 8, label: "Netflix" },
  { id: 119, label: "Prime Video" },
  { id: 337, label: "Disney+" },
  { id: 1899, label: "Max" },
  { id: 15, label: "Hulu" },
  { id: 350, label: "Apple TV+" },
  { id: 531, label: "Paramount+" },
  { id: 386, label: "Peacock" },
];

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
}: {
  region: string;
  setRegion: (r: string) => void;
  provider: number;
  setProvider: (id: number | null) => void;
  providerLabel: string;
  byId: Map<number, ProviderEntry>;
  providersLoading: boolean;
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
        What's popular on each subscription service right now, by region. Availability
        according to TMDB.
      </p>

      <div className="no-scrollbar mt-6 flex gap-2 overflow-x-auto pb-1">
        {SERVICES.map((s) => {
          const selected = s.id === provider;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setProvider(s.id)}
              aria-pressed={selected}
              className={`flex shrink-0 items-center gap-2.5 rounded-xl border px-4 py-2.5 transition-colors duration-150 ${
                selected
                  ? "border-primary/70 bg-primary/10 text-white"
                  : "border-white/[0.08] bg-white/[0.03] text-ink-dim hover:border-white/25 hover:text-white"
              }`}
            >
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
        {providersLoading && (
          <span className="grid place-items-center px-4 text-ink-dim" aria-hidden>
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
