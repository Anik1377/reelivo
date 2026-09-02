"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MediaType } from "./tmdb-types";
/* ---------------------------------- router --------------------------------- */

const HOME_ROUTE: Route = { name: "home" };

export type Route =
  | { name: "home" }
  | { name: "films"; genre?: string; mode?: string }
  | { name: "series"; genre?: string; mode?: string }
  | { name: "services" }
  | { name: "watchlist" }
  | { name: "detail"; type: MediaType; id: number }
  | { name: "person"; id: number; rank?: number }
  | { name: "director"; id: number }
  | { name: "collection"; id: number }
  | { name: "play"; type: MediaType; id: number; season?: number; episode?: number };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [a, b, c, d, e] = parts;
  switch (a) {
    case undefined:
      return { name: "home" };
    case "films":
      return b
        ? { name: "films", genre: b.toLowerCase(), mode: c ? c.toLowerCase() : undefined }
        : { name: "films" };
    case "series":
      return b
        ? { name: "series", genre: b.toLowerCase(), mode: c ? c.toLowerCase() : undefined }
        : { name: "series" };
    case "services":
      return { name: "services" };
    case "watchlist":
      return { name: "watchlist" };
    case "person":
      // optional trailing segment carries a trending rank: #/person/123/4 →
      // shows a "№ 4 trending this week" badge on the profile.
      return { name: "person", id: num(b), rank: num(c) || undefined };
    case "director":
      return { name: "director", id: num(b) };
    case "collection":
      return { name: "collection", id: num(b) };
    case "movie":
      return c === "play"
        ? { name: "play", type: "movie", id: num(b) }
        : { name: "detail", type: "movie", id: num(b) };
    case "tv":
      return c === "play"
        ? { name: "play", type: "tv", id: num(b), season: num(d) || 1, episode: num(e) || 1 }
        : { name: "detail", type: "tv", id: num(b) };
    default:
      return { name: "home" };
  }
}

function num(s?: string): number {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function hrefFor(
  route:
    | { name: "home" | "services" | "watchlist" }
    | { name: "films" | "series"; genre?: string; mode?: string }
    | { name: "detail"; type: MediaType; id: number }
    | { name: "person"; id: number; rank?: number }
    | { name: "director"; id: number }
    | { name: "collection"; id: number }
    | { name: "play"; type: MediaType; id: number; season?: number; episode?: number }
): string {
  switch (route.name) {
    case "home":
      return "#/";
    case "films":
    case "series": {
      // canonical forms: #/films, #/films/horror, #/films/horror/acclaimed,
      // #/films/acclaimed (a bare mode occupies the genre slot; browse shifts it).
      // trending is the default lens and is never written into the hash.
      const hasMode = route.mode && route.mode !== "trending";
      if (route.genre && hasMode) return `#/${route.name}/${route.genre}/${route.mode}`;
      if (route.genre) return `#/${route.name}/${route.genre}`;
      if (hasMode) return `#/${route.name}/${route.mode}`;
      return `#/${route.name}`;
    }
    case "detail":
      return `#/${route.type}/${route.id}`;
    case "person":
      return route.rank ? `#/person/${route.id}/${route.rank}` : `#/person/${route.id}`;
    case "director":
      return `#/director/${route.id}`;
    case "collection":
      return `#/collection/${route.id}`;
    case "play":
      return route.type === "movie"
        ? `#/movie/${route.id}/play`
        : `#/tv/${route.id}/play/${route.season ?? 1}/${route.episode ?? 1}`;
    default:
      return `#/${route.name}`;
  }
}

/* Cached route reader — stable reference per hash so useSyncExternalStore is happy. */
let lastHash: string | null = null;
let lastRoute: Route = { name: "home" };

function currentRoute(): Route {
  if (typeof window === "undefined") return { name: "home" };
  const h = window.location.hash;
  if (h !== lastHash) {
    lastHash = h;
    lastRoute = parseHash(h);
  }
  return lastRoute;
}

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function useHashRoute(): Route {
  // SSR-safe: hydrates with the server's home view, then syncs to the real
  // hash immediately after hydration — no mismatch, no flash of wrong view.
  const route = useSyncExternalStore(subscribeHash, currentRoute, () => HOME_ROUTE);

  const prevHash = useRef<string | null>(null);
  useEffect(() => {
    if (prevHash.current !== null && prevHash.current !== window.location.hash) {
      window.scrollTo({ top: 0 });
    }
    prevHash.current = window.location.hash;
  }, [route]);

  return route;
}

export function navigate(hash: string) {
  window.location.hash = hash;
}

/* ------------------------------- TMDB client ------------------------------- */

export type TmdbParams = Record<string, string | number | boolean | undefined>;

export async function tmdbFetch<T>(path: string, params?: TmdbParams): Promise<T> {
  const qs = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") qs.set(k, String(v));
    }
  }
  const res = await fetch(`/api/tmdb/${path}${qs.toString() ? `?${qs}` : ""}`);
  if (!res.ok) {
    throw new Error(`TMDB ${res.status}`);
  }
  return (await res.json()) as T;
}

const LIST_STALE = 5 * 60 * 1000;
const DETAIL_STALE = 30 * 60 * 1000;

export function useTmdb<T>(
  path: string | null,
  params?: TmdbParams,
  staleTime: number = LIST_STALE
) {
  return useQuery<T>({
    queryKey: ["tmdb", path, params ?? {}],
    queryFn: () => tmdbFetch<T>(path as string, params),
    enabled: path !== null,
    staleTime,
    retry: 1,
  });
}

export function useDetailStaleTime(): number {
  return DETAIL_STALE;
}

/** Prefetch a detail payload on hover — makes detail opens feel instant. */
export function usePrefetchDetail() {
  const qc = useQueryClient();
  return useCallback(
    (type: MediaType, id: number) => {
      qc.prefetchQuery({
        queryKey: ["tmdb", `${type}/${id}`, {}],
        queryFn: () => tmdbFetch(`${type}/${id}`),
        staleTime: DETAIL_STALE,
      });
    },
    [qc]
  );
}
