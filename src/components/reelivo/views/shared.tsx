"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { hrefFor, navigate, useHashRoute, usePrefetchDetail } from "@/lib/hooks";
import { poster } from "@/lib/format";
import { useReelivo, type SavedItem } from "@/lib/store";
import type { SharedListItem, SharedListPayload } from "@/lib/tmdb-types";
import { EmptyNote, ErrorNote, Img, LostLink, Score, StillSkeleton } from "../bits";

/* GET /api/lists/share returns item.id as a STRING (it round-trips through
 * the share pipeline's JSON storage) — normalize back to numbers here, dedupe
 * by id+type, and drop junk rows defensively (importWatchlist style). */
function normalizeItems(items: SharedListPayload["items"]): SharedListItem[] {
  const out: SharedListItem[] = [];
  const seen = new Set<string>();
  for (const it of Array.isArray(items) ? items : []) {
    const id = Number(it?.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (it?.type !== "movie" && it?.type !== "tv") continue;
    const key = `${it.type}-${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id,
      type: it.type,
      title: typeof it.title === "string" && it.title ? it.title : "Untitled",
      poster: it.poster ?? null,
      backdrop: it.backdrop ?? null,
      year: typeof it.year === "string" && it.year ? it.year : "—",
      rating: typeof it.rating === "number" ? it.rating : 0,
    });
  }
  return out;
}

/* ------------------------------- poster card ------------------------------- */

function SharedCard({ item }: { item: SharedListItem }) {
  const prefetch = usePrefetchDetail();
  const open = () => navigate(hrefFor({ name: "detail", type: item.type, id: item.id }));

  return (
    <article className="group">
      <div
        role="link"
        tabIndex={0}
        aria-label={`${item.title} — open details`}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === "Enter") open();
        }}
        onMouseEnter={() => prefetch(item.type, item.id)}
        onFocus={() => prefetch(item.type, item.id)}
        className="relative aspect-[2/3] w-full cursor-pointer overflow-hidden rounded-xl bg-surface-2 ring-1 ring-white/[0.06] transition-all duration-200 group-hover:ring-white/25 group-focus-within:ring-primary/60 active:scale-[0.985]"
      >
        <Img
          src={poster(item.poster, "w342")}
          alt={item.title}
          fallbackTitle={item.title}
          className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
        />
        <span
          aria-hidden
          className="absolute right-2 top-2 rounded-full bg-black/55 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-white/85 backdrop-blur-sm"
        >
          {item.type === "movie" ? "Film" : "Series"}
        </span>
      </div>
      <div className="mt-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold leading-tight text-foreground">
            {item.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-ink-dim">
            {item.year} · {item.type === "movie" ? "Film" : "Series"}
          </p>
        </div>
        <Score value={item.rating} className="mt-0.5 shrink-0" />
      </div>
    </article>
  );
}

/* ---------------------------------- view ----------------------------------- */

export function SharedListView() {
  /* The router mounts this view for #/shared/{id} — the id is read here so the
   * component stays self-contained (no props needed from app.tsx). */
  const route = useHashRoute();
  const id = route.name === "shared" ? route.id : "";

  const watchlist = useReelivo((s) => s.watchlist);
  const importWatchlist = useReelivo((s) => s.importWatchlist);
  const [imported, setImported] = useState(false);

  const q = useQuery<SharedListPayload>({
    queryKey: ["shared-list", id],
    queryFn: async () => {
      const res = await fetch(`/api/lists/share?id=${encodeURIComponent(id)}`);
      if (!res.ok) {
        throw Object.assign(new Error(`share ${res.status}`), { status: res.status });
      }
      return (await res.json()) as SharedListPayload;
    },
    enabled: id.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const name = q.data?.name ?? "";
  const items = useMemo(() => (q.data ? normalizeItems(q.data.items) : []), [q.data]);

  useEffect(() => {
    if (name) document.title = `${name} — shared list — Reelivo`;
    return () => {
      document.title = "Reelivo — what to watch tonight";
    };
  }, [name]);

  /* "all already present" mirrors importWatchlist's id-based membership. */
  const presentIds = useMemo(() => new Set(watchlist.map((w) => w.id)), [watchlist]);
  const allPresent = items.length > 0 && items.every((i) => presentIds.has(i.id));
  const canAdd = items.length > 0 && !imported && !allPresent;

  const onImportAll = () => {
    const rows: SavedItem[] = items.map((i) => ({ ...i, addedAt: Date.now() }));
    const n = importWatchlist(rows);
    setImported(true);
    if (n > 0) toast.success(n === 1 ? "Added 1 title" : `Added ${n} titles`);
    else toast.message("Already in your list");
  };

  /* Defensive: parseHash only routes well-formed ids here (junk falls back to
   * home) — but if the view is ever mounted without a shared route, fail to
   * the designed dead-end instead of spinning forever. */
  if (!id) return <LostLink />;

  const notFound = q.isError && (q.error as { status?: number } | null)?.status === 404;

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-24 md:px-8 md:pt-32 2xl:max-w-[1720px]">
      {q.isPending ? (
        <>
          <StillSkeleton className="h-4 w-28" />
          <StillSkeleton className="mt-3 h-9 w-72 max-w-full" />
          <StillSkeleton className="mt-3 h-3.5 w-44" />
          <div
            className="mt-9 grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
            aria-hidden
          >
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i}>
                <StillSkeleton className="aspect-[2/3] w-full" />
                <StillSkeleton className="mt-2.5 h-3 w-2/3" />
              </div>
            ))}
          </div>
        </>
      ) : notFound ? (
        <div className="pt-8">
          <EmptyNote title="This shared list has drifted away">
            The link may be wrong, or the list was never saved. Ask for a fresh
            link — or dive into the catalogue meanwhile.
          </EmptyNote>
          <div className="mt-6 text-center">
            <a
              href="#/"
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-[13px] font-bold text-black transition-all duration-150 hover:-translate-y-px hover:shadow-[0_10px_28px_rgba(0,168,225,0.35)] active:translate-y-0"
            >
              Back to browse
            </a>
          </div>
        </div>
      ) : q.isError ? (
        <div className="pt-8">
          <ErrorNote onRetry={() => q.refetch()} />
        </div>
      ) : items.length === 0 ? (
        <>
          <p className="kicker text-primary">Shared list</p>
          <h1 className="display mt-1.5 text-3xl tracking-tight md:text-4xl">{name}</h1>
          <p className="mt-2 text-[13px] text-ink-dim">0 titles · curated on Reelivo</p>
          <div className="mt-8">
            <EmptyNote title="This list is empty">
              Nothing was in the list when it was shared — nothing to import.
            </EmptyNote>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
            <div>
              <p className="kicker text-primary">Shared list</p>
              <h1 className="display mt-1.5 text-3xl tracking-tight text-balance md:text-4xl">
                {name}
              </h1>
              <p className="mt-2 text-[13px] text-ink-dim">
                {items.length} {items.length === 1 ? "title" : "titles"} · curated on Reelivo
              </p>
            </div>
            <button
              type="button"
              onClick={onImportAll}
              disabled={!canAdd}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[13px] font-bold text-black transition-all duration-150 hover:-translate-y-px hover:shadow-[0_10px_28px_rgba(0,168,225,0.35)] active:translate-y-0 disabled:pointer-events-none disabled:opacity-50"
            >
              {imported || allPresent ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <Plus className="size-4" aria-hidden />
              )}
              {imported
                ? "Added to your list"
                : allPresent
                  ? "Already in your list"
                  : "Add all to my list"}
            </button>
          </div>

          <div className="mt-9 grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {items.map((i) => (
              <SharedCard key={`${i.type}-${i.id}`} item={i} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
