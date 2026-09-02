"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MediaType } from "./tmdb-types";

export interface SavedItem {
  id: number;
  type: MediaType;
  title: string;
  poster: string | null;
  backdrop: string | null;
  year: string;
  rating: number;
  addedAt: number;
  /** Optional custom list name. Items without one live in "My list". */
  folder?: string;
}

export const DEFAULT_FOLDER = ""; // "My list" — items with no folder

export interface ProgressEntry extends SavedItem {
  key: string;
  season?: number;
  episode?: number;
  episodeName?: string;
  timestamp: number;
  duration: number;
  updatedAt: number;
}

interface ReelivoState {
  watchlist: SavedItem[];
  recents: SavedItem[];
  progress: Record<string, ProgressEntry>;
  lastEpisode: Record<string, { season: number; episode: number }>;
  searchHistory: string[];
  region: string;
  serviceFocus: number | null;

  isInWatchlist: (id: number) => boolean;
  toggleWatchlist: (item: SavedItem) => "added" | "removed";
  importWatchlist: (items: SavedItem[]) => number;
  clearWatchlist: () => void;
  moveToFolder: (id: number, type: MediaType, folder: string | null) => void;
  renameFolder: (from: string, to: string) => void;
  deleteFolder: (name: string) => void;
  pushRecent: (item: SavedItem) => void;
  saveProgress: (entry: Omit<ProgressEntry, "key" | "updatedAt">) => void;
  clearProgress: (key: string) => void;
  getProgress: (id: number, type: MediaType, season?: number, episode?: number) => ProgressEntry | undefined;
  setLastEpisode: (id: number, season: number, episode: number) => void;
  getLastEpisode: (id: number) => { season: number; episode: number } | undefined;
  pushSearch: (q: string) => void;
  setRegion: (r: string) => void;
  setServiceFocus: (id: number | null) => void;
}

export const progressKey = (id: number, type: MediaType, season?: number, episode?: number) =>
  type === "tv" ? `${type}-${id}-s${season ?? 1}e${episode ?? 1}` : `${type}-${id}`;

export const useReelivo = create<ReelivoState>()(
  persist(
    (set, get) => ({
      watchlist: [],
      recents: [],
      progress: {},
      lastEpisode: {},
      searchHistory: [],
      region: "US",
      serviceFocus: null,

      isInWatchlist: (id) => get().watchlist.some((w) => w.id === id),

      toggleWatchlist: (item) => {
        const list = get().watchlist;
        const exists = list.some((w) => w.id === item.id);
        set({
          watchlist: exists
            ? list.filter((w) => w.id !== item.id)
            : [{ ...item, addedAt: Date.now() }, ...list],
        });
        return exists ? "removed" : "added";
      },

      /** Merge an imported list, skipping ids already present. Returns how many were added. */
      importWatchlist: (items) => {
        const valid = items.filter(
          (i) =>
            typeof i?.id === "number" &&
            (i.type === "movie" || i.type === "tv") &&
            typeof i?.title === "string" &&
            i.title.length > 0
        );
        if (valid.length === 0) return 0;
        const existing = new Set(get().watchlist.map((w) => w.id));
        const fresh = valid
          .filter((i) => !existing.has(i.id))
          .map((i) => ({
            ...i,
            poster: i.poster ?? null,
            backdrop: i.backdrop ?? null,
            year: i.year ?? "—",
            rating: i.rating ?? 0,
            addedAt: i.addedAt ?? Date.now(),
            folder:
              typeof i.folder === "string" && i.folder.trim().length > 0
                ? i.folder.trim().slice(0, 40)
                : undefined,
          }));
        if (fresh.length > 0) {
          set((s) => ({ watchlist: [...fresh, ...s.watchlist] }));
        }
        return fresh.length;
      },

      clearWatchlist: () => set({ watchlist: [] }),

      /** Move a saved title into a custom list (null = back to "My list"). */
      moveToFolder: (id, type, folder) =>
        set((s) => ({
          watchlist: s.watchlist.map((w) => {
            const clean = folder?.trim().slice(0, 40);
            return w.id === id && w.type === type
              ? { ...w, folder: clean ? clean : undefined }
              : w;
          }),
        })),

      /** Rename a custom list everywhere (merge if the target already exists). */
      renameFolder: (from, to) =>
        set((s) => {
          const clean = to.trim().slice(0, 40);
          if (!clean) return {};
          return {
            watchlist: s.watchlist.map((w) =>
              w.folder === from ? { ...w, folder: clean === DEFAULT_FOLDER ? undefined : clean } : w
            ),
          };
        }),

      /** Dissolve a custom list — its titles fall back to "My list". */
      deleteFolder: (name) =>
        set((s) => ({
          watchlist: s.watchlist.map((w) =>
            w.folder === name ? { ...w, folder: undefined } : w
          ),
        })),

      pushRecent: (item) =>
        set((s) => ({
          recents: [item, ...s.recents.filter((r) => r.id !== item.id)].slice(0, 20),
        })),

      saveProgress: (entry) =>
        set((s) => {
          const key = progressKey(entry.id, entry.type, entry.season, entry.episode);
          return {
            progress: {
              ...s.progress,
              [key]: { ...entry, key, updatedAt: Date.now() },
            },
          };
        }),

      clearProgress: (key) =>
        set((s) => {
          const next = { ...s.progress };
          delete next[key];
          return { progress: next };
        }),

      getProgress: (id, type, season, episode) =>
        get().progress[progressKey(id, type, season, episode)],

      setLastEpisode: (id, season, episode) =>
        set((s) => ({ lastEpisode: { ...s.lastEpisode, [id]: { season, episode } } })),

      getLastEpisode: (id) => get().lastEpisode[id],

      pushSearch: (q) => {
        const query = q.trim();
        if (!query) return;
        set((s) => ({
          searchHistory: [query, ...s.searchHistory.filter((h) => h !== query)].slice(0, 8),
        }));
      },

      setRegion: (region) => set({ region }),

      setServiceFocus: (serviceFocus) => set({ serviceFocus }),
    }),
    { name: "reelivo-v1" }
  )
);

/** Honest Continue queue — started but not finished, newest first. */
export function continueEntries(progress: Record<string, ProgressEntry>): ProgressEntry[] {
  return Object.values(progress)
    .filter((p) => p.duration > 0 && p.timestamp / p.duration < 0.95 && p.timestamp > 30)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 10);
}
