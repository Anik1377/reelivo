"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Info, Play } from "lucide-react";
import { toast } from "sonner";
import type { MediaItem, MediaType } from "@/lib/tmdb-types";
import { genreNames, poster, still, titleOf, typeOf, yearOf } from "@/lib/format";
import { hrefFor, navigate, usePrefetchDetail } from "@/lib/hooks";
import { useReelivo, type SavedItem } from "@/lib/store";
import { openFolderPicker } from "./folder-picker";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Img, useMounted } from "./bits";

export { useMounted };

export function toSavedItem(item: MediaItem, type: MediaType): SavedItem {
  return {
    id: item.id,
    type,
    title: titleOf(item),
    poster: item.poster_path ?? null, // raw TMDB path
    backdrop: item.backdrop_path ?? null,
    year: yearOf(item),
    rating: item.vote_average ?? 0,
    addedAt: Date.now(),
  };
}

export function SaveButton({
  item,
  type,
  media,
}: {
  item: MediaItem;
  type: MediaType;
  media?: SavedItem; // precomputed (detail pages)
}) {
  const { toggleWatchlist, isInWatchlist } = useReelivo();
  const mounted = useMounted();
  const saved = mounted && isInWatchlist(item.id);

  const onSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    const result = toggleWatchlist(media ?? toSavedItem(item, type));
    if (result === "added") {
      toast.success(`Saved “${titleOf(item)}” to My list`, {
        action: {
          label: "File into…",
          onClick: () => openFolderPicker({ id: item.id, type, title: titleOf(item) }),
        },
      });
    } else {
      toast.message("Removed from your list");
    }
  };

  return (
    <button
      type="button"
      onClick={onSave}
      aria-label={saved ? "Remove from your list" : "Save to your list"}
      className="chip-glass grid size-9 place-items-center rounded-full text-white transition-all duration-150 hover:border-white/40 active:scale-90"
    >
      {saved ? <BookmarkCheck className="size-4 text-primary" /> : <Bookmark className="size-4" />}
    </button>
  );
}

/* Netflix-style hover preview — a pop card with backdrop, meta, overview and
 * actions. Radix portals it, so the rail's overflow can't clip it; opens on
 * hover (with intent delay) AND on keyboard focus for parity. */
function CardPreview({
  item,
  type,
  children,
}: {
  item: MediaItem;
  type: MediaType;
  children: React.ReactNode;
}) {
  const title = titleOf(item);
  const meta = [
    yearOf(item),
    type === "movie" ? "Film" : "Series",
    item.genre_ids ? genreNames(item.genre_ids, 3) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <HoverCard openDelay={420} closeDelay={140}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="start"
        sideOffset={12}
        role="group"
        aria-label={`${title} preview`}
        className="w-[336px] rounded-xl border-white/10 bg-surface/95 p-0 shadow-[0_30px_80px_rgba(0,0,0,0.8)] backdrop-blur-md"
      >
        <div className="relative aspect-[16/8] w-full overflow-hidden rounded-t-xl bg-surface-2">
          <Img
            src={still(item.backdrop_path, "w780") ?? poster(item.poster_path, "w342")}
            alt=""
            fallbackTitle={title}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
          <button
            type="button"
            aria-label={`Play ${title} free`}
            onClick={() => navigate(hrefFor({ name: "play", type, id: item.id }))}
            className="absolute bottom-2.5 right-2.5 inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-[12.5px] font-bold text-black shadow-[0_8px_24px_rgba(0,0,0,0.6)] transition-transform duration-150 hover:scale-105 active:scale-95"
          >
            <Play className="size-3.5 fill-current" aria-hidden />
            Play
          </button>
        </div>
        <div className="p-3.5">
          <div className="flex items-baseline justify-between gap-2.5">
            <p className="truncate text-[14px] font-bold text-foreground">{title}</p>
            <ScoreLite value={item.vote_average} className="shrink-0" />
          </div>
          <p className="mt-0.5 truncate text-[11.5px] text-ink-dim">{meta}</p>
          {item.overview ? (
            <p className="mt-2 line-clamp-3 text-[12.5px] leading-relaxed text-ink-dim">
              {item.overview}
            </p>
          ) : null}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(hrefFor({ name: "detail", type, id: item.id }))}
              className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] text-[12.5px] font-semibold text-white/85 transition-colors duration-150 hover:border-white/25 hover:text-white"
            >
              <Info className="size-3.5" aria-hidden />
              Details
            </button>
            <SaveButton item={item} type={type} />
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

/** 16:9 still card — hover collapses a click (play without leaving the row). */
export function StillCard({
  item,
  type,
  sub,
  showScore = true,
  fluid = false,
  preview = false,
}: {
  item: MediaItem;
  type: MediaType;
  sub?: string;
  showScore?: boolean;
  fluid?: boolean;
  preview?: boolean;
}) {
  const prefetch = usePrefetchDetail();
  const title = titleOf(item);
  const onHover = useCallback(() => prefetch(type, item.id), [prefetch, type, item.id]);

  const art = (
    <div
      role="link"
      tabIndex={0}
      aria-label={`${title} — open details`}
      onClick={() => navigate(hrefFor({ name: "detail", type, id: item.id }))}
      onKeyDown={(e) => {
        if (e.key === "Enter") navigate(hrefFor({ name: "detail", type, id: item.id }));
      }}
      onMouseEnter={onHover}
      onFocus={onHover}
      className="relative aspect-video w-full cursor-pointer overflow-hidden rounded-xl bg-surface-2 ring-1 ring-white/[0.06] transition-all duration-200 group-hover:ring-white/25 group-focus-within:ring-primary/60 active:scale-[0.985]"
    >
      <Img
        src={still(item.backdrop_path, "w780") ?? poster(item.poster_path, "w342")}
        alt={title}
        fallbackTitle={title}
        className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 transition-all duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          type="button"
          aria-label={`Play ${title} free`}
          onClick={(e) => {
            e.stopPropagation();
            navigate(hrefFor({ name: "play", type, id: item.id }));
          }}
          className="grid size-11 place-items-center rounded-full bg-white text-black shadow-[0_8px_28px_rgba(0,0,0,0.55)] transition-transform duration-150 hover:scale-105 active:scale-95"
        >
          <Play className="ml-0.5 size-5 fill-current" />
        </button>
        <SaveButton item={item} type={type} />
      </div>
      {/* hover-only genre reveal — extra context without leaving the row */}
      {item.genre_ids && genreNames(item.genre_ids, 2) && (
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-2.5 left-2.5 flex translate-y-1 gap-1.5 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100"
        >
          {genreNames(item.genre_ids, 2)
            .split(" · ")
            .map((g) => (
              <span
                key={g}
                className="chip-glass rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white/90"
              >
                {g}
              </span>
            ))}
        </div>
      )}
    </div>
  );

  return (
    <article
      className={`group ${fluid ? "w-full" : "w-[240px] shrink-0 snap-start md:w-[300px] 2xl:w-[340px]"}`}
    >
      {preview ? <CardPreview item={item} type={type}>{art}</CardPreview> : art}
      <div className="mt-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold leading-tight text-foreground">
            {title}
          </p>
          <p className="mt-0.5 truncate text-xs text-ink-dim">
            {sub ?? `${yearOf(item)} · ${type === "movie" ? "Film" : "Series"}${
              item.genre_ids ? ` · ${genreNames(item.genre_ids)}` : ""
            }`}
          </p>
        </div>
        {showScore && <ScoreLite value={item.vote_average} className="mt-0.5 shrink-0" />}
      </div>
    </article>
  );
}

function ScoreLite({ value, className = "" }: { value?: number; className?: string }) {
  if (typeof value !== "number" || value <= 0) return null;
  return (
    <span className={`tabular text-xs font-semibold text-primary ${className}`}>
      {value.toFixed(1)}
    </span>
  );
}

/** Horizontal rail with scroll-aware edge fades + arrows on desktop. */
export function Rail({
  label,
  children,
  ariaLabel,
}: {
  label: string;
  children: React.ReactNode;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // which edges still hide content — fades only appear when there's more to scroll
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      setEdges({
        left: el.scrollLeft > 8,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 8,
      });
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, []);

  const scroll = (dir: 1 | -1) => {
    ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <div className="group/rail relative">
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto scroll-smooth px-4 pb-1 md:mx-0 md:px-0"
      >
        {children}
      </div>
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 left-0 hidden w-14 bg-gradient-to-r from-background to-transparent transition-opacity duration-300 md:block ${
          edges.left ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 right-0 hidden w-14 bg-gradient-to-l from-background to-transparent transition-opacity duration-300 md:block ${
          edges.right ? "opacity-100" : "opacity-0"
        }`}
      />
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-12 items-center opacity-0 transition-opacity duration-200 group-hover/rail:pointer-events-auto group-hover/rail:opacity-100 md:flex">
        <button
          type="button"
          onClick={() => scroll(-1)}
          aria-label={`Scroll ${label} left`}
          className="chip-glass pointer-events-auto grid size-9 place-items-center rounded-full text-white transition-all duration-150 hover:border-white/40 active:scale-90"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-12 items-center justify-end opacity-0 transition-opacity duration-200 group-hover/rail:pointer-events-auto group-hover/rail:opacity-100 md:flex">
        <button
          type="button"
          onClick={() => scroll(1)}
          aria-label={`Scroll ${label} right`}
          className="chip-glass pointer-events-auto grid size-9 place-items-center rounded-full text-white transition-all duration-150 hover:border-white/40 active:scale-90"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
