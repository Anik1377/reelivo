"use client";

import { create, type StoreApi } from "zustand";
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

/* --------------------------------- profiles -------------------------------- */
/* Local, backend-less profiles. Everything a person does — list, resume,
 * history — is namespaced under their profile id. The store mirrors the
 * ACTIVE profile's data onto the top-level fields (watchlist, progress, …)
 * so every existing selector keeps its shape; each mutation writes through
 * to the profile's slice via commit(). */

export interface Profile {
  id: string;
  name: string;
  /** Index into the AVATARS set (src/components/reelivo/profiles.tsx). */
  avatar: number;
  kids: boolean;
  createdAt: number;
}

export interface ProfileData {
  watchlist: SavedItem[];
  recents: SavedItem[];
  progress: Record<string, ProgressEntry>;
  lastEpisode: Record<string, { season: number; episode: number }>;
  searchHistory: string[];
}

const EMPTY_DATA: ProfileData = {
  watchlist: [],
  recents: [],
  progress: {},
  lastEpisode: {},
  searchHistory: [],
};

/** Gate mode: "who" = pick a profile · "manage" = pick + edit · "off" = in-app. */
export type GateMode = "who" | "manage" | "off";

interface ReelivoState {
  /* profile layer */
  profiles: Profile[];
  activeProfileId: string | null;
  /** Ephemeral — deliberately NOT persisted: every cold load opens "Who's watching?". */
  gate: GateMode;
  data: Record<string, ProfileData>;

  /* active profile mirror — what the whole UI reads */
  watchlist: SavedItem[];
  recents: SavedItem[];
  progress: Record<string, ProgressEntry>;
  lastEpisode: Record<string, { season: number; episode: number }>;
  searchHistory: string[];

  /* device-level prefs (shared across profiles) */
  region: string;
  serviceFocus: number | null;

  /* profile actions */
  addProfile: (p: { name: string; avatar: number; kids: boolean }) => string;
  updateProfile: (id: string, patch: Partial<Pick<Profile, "name" | "avatar" | "kids">>) => void;
  deleteProfile: (id: string) => void;
  switchProfile: (id: string) => void;
  openGate: (mode: Exclude<GateMode, "off">) => void;
  closeGate: () => void;

  /* media actions (per active profile) */
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

type SetFn = StoreApi<ReelivoState>["setState"];

/** Write the data-bearing fields into the active profile's slice as well as
 * the top-level mirror, in one set() so selectors and persistence agree. */
function commit(
  set: SetFn,
  get: () => ReelivoState,
  patch: Partial<ProfileData>
) {
  const s = get();
  const id = s.activeProfileId;
  if (!id) {
    set(patch);
    return;
  }
  const slice: ProfileData = { ...EMPTY_DATA, ...s.data[id], ...patch };
  set({ ...patch, data: { ...s.data, [id]: slice } });
}

export const useReelivo = create<ReelivoState>()(
  persist(
    (set, get) => ({
      profiles: [],
      activeProfileId: null,
      gate: "who",
      data: {},

      watchlist: [],
      recents: [],
      progress: {},
      lastEpisode: {},
      searchHistory: [],

      region: "US",
      serviceFocus: null,

      /* ------------------------------ profiles ------------------------------ */

      addProfile: ({ name, avatar, kids }) => {
        const id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const profile: Profile = {
          id,
          name: name.trim().slice(0, 20) || "Guest",
          avatar: Math.max(0, Math.floor(avatar)) % 8,
          kids,
          createdAt: Date.now(),
        };
        set((s) => ({
          profiles: [...s.profiles, profile],
          data: { ...s.data, [id]: { ...EMPTY_DATA } },
        }));
        return id;
      },

      updateProfile: (id, patch) =>
        set((s) => ({
          profiles: s.profiles.map((p) =>
            p.id === id
              ? {
                  ...p,
                  ...("name" in patch
                    ? { name: (patch.name ?? "").trim().slice(0, 20) || p.name }
                    : null),
                  ...("avatar" in patch ? { avatar: patch.avatar ?? p.avatar } : null),
                  ...("kids" in patch ? { kids: patch.kids ?? p.kids } : null),
                }
              : p
          ),
        })),

      deleteProfile: (id) => {
        set((s) => {
          const profiles = s.profiles.filter((p) => p.id !== id);
          const data = { ...s.data };
          delete data[id];
          const wasActive = s.activeProfileId === id;
          return {
            profiles,
            data,
            activeProfileId: wasActive ? null : s.activeProfileId,
            gate: wasActive ? "who" : s.gate,
            // if the deleted one was active, blank the mirror so nothing leaks
            ...(wasActive ? { ...EMPTY_DATA } : null),
          };
        });
      },

      switchProfile: (id) => {
        const s = get();
        const slice: ProfileData = { ...EMPTY_DATA, ...s.data[id] };
        set({
          activeProfileId: id,
          gate: "off",
          watchlist: slice.watchlist,
          recents: slice.recents,
          progress: slice.progress,
          lastEpisode: slice.lastEpisode,
          searchHistory: slice.searchHistory,
        });
      },

      openGate: (mode) => set({ gate: mode }),
      closeGate: () => set({ gate: "off" }),

      /* --------------------------- media (mirror) --------------------------- */

      isInWatchlist: (id) => get().watchlist.some((w) => w.id === id),

      toggleWatchlist: (item) => {
        const list = get().watchlist;
        const exists = list.some((w) => w.id === item.id);
        commit(set, get, {
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
          const s = get();
          if (s.activeProfileId) {
            commit(set, get, { watchlist: s.watchlist });
          }
        }
        return fresh.length;
      },

      clearWatchlist: () => commit(set, get, { watchlist: [] }),

      /** Move a saved title into a custom list (null = back to "My list"). */
      moveToFolder: (id, type, folder) => {
        const watchlist = get().watchlist.map((w) => {
          const clean = folder?.trim().slice(0, 40);
          return w.id === id && w.type === type
            ? { ...w, folder: clean ? clean : undefined }
            : w;
        });
        commit(set, get, { watchlist });
      },

      /** Rename a custom list everywhere (merge if the target already exists). */
      renameFolder: (from, to) => {
        const clean = to.trim().slice(0, 40);
        if (!clean) return;
        commit(set, get, {
          watchlist: get().watchlist.map((w) =>
            w.folder === from ? { ...w, folder: clean === DEFAULT_FOLDER ? undefined : clean } : w
          ),
        });
      },

      /** Dissolve a custom list — its titles fall back to "My list". */
      deleteFolder: (name) => {
        commit(set, get, {
          watchlist: get().watchlist.map((w) =>
            w.folder === name ? { ...w, folder: undefined } : w
          ),
        });
      },

      pushRecent: (item) => {
        const recents = [
          item,
          ...get().recents.filter((r) => r.id !== item.id),
        ].slice(0, 20);
        commit(set, get, { recents });
      },

      saveProgress: (entry) => {
        const key = progressKey(entry.id, entry.type, entry.season, entry.episode);
        commit(set, get, {
          progress: {
            ...get().progress,
            [key]: { ...entry, key, updatedAt: Date.now() },
          },
        });
      },

      clearProgress: (key) => {
        const next = { ...get().progress };
        delete next[key];
        commit(set, get, { progress: next });
      },

      getProgress: (id, type, season, episode) =>
        get().progress[progressKey(id, type, season, episode)],

      setLastEpisode: (id, season, episode) => {
        commit(set, get, { lastEpisode: { ...get().lastEpisode, [id]: { season, episode } } });
      },

      getLastEpisode: (id) => get().lastEpisode[id],

      pushSearch: (q) => {
        const query = q.trim();
        if (!query) return;
        commit(set, get, {
          searchHistory: [query, ...get().searchHistory.filter((h) => h !== query)].slice(0, 8),
        });
      },

      setRegion: (region) => set({ region }),

      setServiceFocus: (serviceFocus) => set({ serviceFocus }),
    }),
    {
      name: "reelivo-v1", // same key as before — existing data rides along
      version: 2,
      /* v0/v1 payloads are the pre-profile shape (data on top level) — pass
       * them through; onRehydrateStorage adopts them into a first profile. */
      migrate: (persisted) => persisted as ReelivoState,
      /* `gate` is ephemeral and must never survive a reload. */
      partialize: (s) => ({
        profiles: s.profiles,
        activeProfileId: s.activeProfileId,
        data: s.data,
        watchlist: s.watchlist,
        recents: s.recents,
        progress: s.progress,
        lastEpisode: s.lastEpisode,
        searchHistory: s.searchHistory,
        region: s.region,
        serviceFocus: s.serviceFocus,
      }),
    }
  )
);

/* One-time adoption of pre-profile data: whatever the app accumulated before
 * profiles existed becomes the first profile, so nobody loses a list or their
 * resume queue. Runs after hydration — during create() the store variable is
 * still in its temporal dead zone, which is exactly when sync rehydration
 * fires, so this lives OUTSIDE the persist options. */
function adoptLegacyData() {
  const s = useReelivo.getState();
  if (s.profiles.length > 0) return;
  const hasData =
    s.watchlist.length > 0 ||
    s.recents.length > 0 ||
    s.searchHistory.length > 0 ||
    Object.keys(s.progress ?? {}).length > 0 ||
    Object.keys(s.lastEpisode ?? {}).length > 0;
  if (!hasData) return;
  const id = `p_${Date.now().toString(36)}`;
  useReelivo.setState({
    profiles: [
      { id, name: "My profile", avatar: 0, kids: false, createdAt: Date.now() },
    ],
    activeProfileId: id,
    data: {
      [id]: {
        watchlist: s.watchlist,
        recents: s.recents,
        progress: s.progress,
        lastEpisode: s.lastEpisode,
        searchHistory: s.searchHistory,
      },
    },
  });
}

if (typeof window !== "undefined") {
  if (useReelivo.persist.hasHydrated()) {
    adoptLegacyData();
  } else {
    useReelivo.persist.onFinishHydration(adoptLegacyData);
  }
}

/** Honest Continue queue — started but not finished, newest first. */
export function continueEntries(progress: Record<string, ProgressEntry>): ProgressEntry[] {
  return Object.values(progress)
    .filter((p) => p.duration > 0 && p.timestamp / p.duration < 0.95 && p.timestamp > 30)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 10);
}
