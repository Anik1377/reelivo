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
  /** Hash of a 4-digit PIN (see lib/pin.ts) — a gentle, local-only lock that
   * asks for the digits before the profile opens. Absent = open profile. */
  pin?: string;
}

export interface ProfileData {
  watchlist: SavedItem[];
  recents: SavedItem[];
  progress: Record<string, ProgressEntry>;
  lastEpisode: Record<string, { season: number; episode: number }>;
  searchHistory: string[];
  /** Everything this profile ever pressed play on, newest first. */
  history: HistoryEntry[];
}

/** One row of viewing history — a play session on a title (or one episode). */
export interface HistoryEntry extends SavedItem {
  key: string;
  season?: number;
  episode?: number;
  /** 0..1 — how far the last play got. */
  pct: number;
  watchedAt: number;
}

const EMPTY_DATA: ProfileData = {
  watchlist: [],
  recents: [],
  progress: {},
  lastEpisode: {},
  searchHistory: [],
  history: [],
};

/** Gate mode: "who" = pick a profile · "manage" = pick + edit · "off" = in-app. */
export type GateMode = "who" | "manage" | "off";

/** Resolve the wall's visibility. `gate` is the EXPLICIT override (opened via
 * the switcher / manage flow, closed by its Done button); when no override is
 * active, the wall derives from the rehydrated profiles: it appears only when
 * there is a decision to make — no profiles (onboarding), none active, or the
 * active profile is PIN-locked (its lock must hold on a cold load). Everyone
 * else is recognized and lands straight in the app.
 *
 * Deriving (instead of writing a state flip from an effect) matters: with
 * streamed SSR + selective hydration, a store flip inside a layout effect
 * re-renders while later boundaries are still hydrating, and the freshly
 * mounted subtree diverges from the server HTML (the return of the Radix
 * useId mismatch). The rehydrate itself — which lands profiles here — is the
 * only mutation, and it happens in ReelivoApp's layout effect before paint. */
/* Profiles that passed their PIN this browser session live in the store as
 * `unlocked` — ephemeral (partialize never persists it), so a cold load asks
 * again. It must live IN the store (not a module set) because deriveGate runs
 * at render time: unlocking the ALREADY-active profile changes nothing else
 * (same id, same profiles, gate already "off"), and a change React can't see
 * would leave the wall hanging. */

export function deriveGate(
  gate: GateMode,
  profiles: Profile[],
  activeProfileId: string | null,
  unlocked: string[]
): GateMode {
  if (gate !== "off") return gate;
  const active = profiles.find((p) => p.id === activeProfileId);
  if (!active || (active.pin && !unlocked.includes(active.id))) return "who";
  return "off";
}

interface ReelivoState {
  /* profile layer */
  profiles: Profile[];
  activeProfileId: string | null;
  /** Ephemeral — deliberately NOT persisted: every cold load opens "Who's watching?". */
  gate: GateMode;
  /** Profiles that passed their PIN this session — ephemeral (never
   * persisted), read by deriveGate so an unlocked active profile stays in. */
  unlocked: string[];
  data: Record<string, ProfileData>;

  /* active profile mirror — what the whole UI reads */
  watchlist: SavedItem[];
  recents: SavedItem[];
  progress: Record<string, ProgressEntry>;
  lastEpisode: Record<string, { season: number; episode: number }>;
  searchHistory: string[];
  history: HistoryEntry[];

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
  markProfileUnlocked: (id: string) => void;
  /** Store the PIN hash (or null to remove the lock). Hashing happens in the
   * caller via lib/pin.ts so the store stays synchronous. */
  setProfilePin: (id: string, pinHash: string | null) => void;

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
  /** Upsert one viewing-history row (keyed like progress); capped at 100. */
  logHistory: (item: SavedItem & { season?: number; episode?: number }, pct?: number) => void;
  removeHistory: (key: string) => void;
  clearHistory: () => void;
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
      /* Default OFF — ReelivoApp re-opens the wall after rehydration only when
       * there is something to decide (no profile, none active, or a locked
       * one). Returning users are recognized and land straight in the app. */
      gate: "off",
      unlocked: [],
      data: {},

      watchlist: [],
      recents: [],
      progress: {},
      lastEpisode: {},
      searchHistory: [],
      history: [],

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
          history: slice.history,
        });
      },

      setProfilePin: (id, pinHash) =>
        set((s) => ({
          profiles: s.profiles.map((p) => (p.id === id ? { ...p, pin: pinHash ?? undefined } : p)),
        })),

      openGate: (mode) => set({ gate: mode }),
      closeGate: () => set({ gate: "off" }),
      markProfileUnlocked: (id) =>
        set((s) => (s.unlocked.includes(id) ? s : { unlocked: [...s.unlocked, id] })),

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
        const progress = {
          ...get().progress,
          [key]: { ...entry, key, updatedAt: Date.now() },
        };
        /* the same event is the history heartbeat — one row per title/episode,
         * moved to the top with the latest position */
        const prev = get().history.find((h) => h.key === key);
        const pct =
          entry.duration > 0
            ? Math.min(1, Math.max(0, entry.timestamp / entry.duration))
            : (prev?.pct ?? 0);
        const row: HistoryEntry = {
          id: entry.id,
          type: entry.type,
          title: entry.title,
          poster: entry.poster,
          backdrop: entry.backdrop,
          year: entry.year,
          rating: entry.rating,
          addedAt: entry.addedAt,
          key,
          season: entry.season,
          episode: entry.episode,
          pct,
          watchedAt: Date.now(),
        };
        commit(set, get, {
          progress,
          history: [row, ...get().history.filter((h) => h.key !== key)].slice(0, 100),
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

      logHistory: (item, pct = 0) => {
        const key = progressKey(item.id, item.type, item.season, item.episode);
        const row: HistoryEntry = {
          ...item,
          key,
          pct: Math.min(1, Math.max(0, pct)),
          watchedAt: Date.now(),
        };
        commit(set, get, {
          history: [row, ...get().history.filter((h) => h.key !== key)].slice(0, 100),
        });
      },

      removeHistory: (key) =>
        commit(set, get, { history: get().history.filter((h) => h.key !== key) }),

      clearHistory: () => commit(set, get, { history: [] }),

      setRegion: (region) => set({ region }),

      setServiceFocus: (serviceFocus) => set({ serviceFocus }),
    }),
    {
      name: "reelivo-v1", // same key as before — existing data rides along
      version: 2,
      /* v0/v1 payloads are the pre-profile shape (data on top level) — pass
       * them through; onRehydrateStorage adopts them into a first profile. */
      migrate: (persisted) => persisted as ReelivoState,
      /* Rehydration is manual (ReelivoApp kicks it off in a layout effect):
       * the client's FIRST render must stay byte-identical to the server's
       * (both see the empty defaults) or React 19 hydration drifts — the
       * class of Radix useId mismatches the console caught. Sync storage
       * applies synchronously inside that effect, so persisted state is in
       * place before the first paint — no flash, no mismatch. */
      skipHydration: true,
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
        history: s.history,
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
        history: [],
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
