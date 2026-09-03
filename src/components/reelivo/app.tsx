"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useHashRoute, type Route } from "@/lib/hooks";
import { deriveGate, useReelivo } from "@/lib/store";
import { TopBar } from "./top-bar";
import { MobileNav } from "./mobile-nav";
import { Footer } from "./footer";
import { SearchDialog } from "./search-dialog";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { BackToTop, ScrollProgress } from "./bits";
import { InstallPill } from "./install-pill";
import { MiniPlayer } from "./mini-player";
import { FolderPicker } from "./folder-picker";
import { ProfileGate, ProfileEditor, ProfilePinDialog } from "./profiles";
import { HomeView } from "./views/home";
import { BrowseView } from "./views/browse";
import { ServicesView } from "./views/services";
import { WatchlistView } from "./views/watchlist";
import { HistoryView } from "./views/history";
import { CalendarView } from "./views/calendar";
import { SharedListView } from "./views/shared";
import { DetailView } from "./views/detail";
import { PersonView } from "./views/person";
import { DirectorView } from "./views/director";
import { CollectionView } from "./views/collection";
import { PlayerView } from "./views/player";

function isTypingTarget(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}

/* Runs as a layout effect on the client, skipped on the server. */
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function ReelivoApp() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false } },
      })
  );

  const route = useHashRoute();
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  /* Persisted store rehydrates here — AFTER the first render, so the client
   * hydrates byte-identical to the server (both see empty defaults; no Radix
   * useId drift, no mismatch warnings). localStorage is synchronous, so the
   * state lands inside this layout effect — before the very first paint.
   * adoptLegacyData (store.ts) rides the onFinishHydration hook.
   *
   * Profile recognition lives in deriveGate (store.ts): the wall's visibility
   * is derived from the rehydrated profiles at render time — returning users
   * go straight in, the wall only appears when there is a decision to make.
   * Keep this effect mutation-free beyond the rehydrate itself (see the note
   * inside): an extra state flip here re-renders mid-hydration and breaks
   * tree positions against the streamed server HTML. */
  useIsoLayoutEffect(() => {
    useReelivo.persist.rehydrate();
    /* NO extra setState here: the wall's visibility is DERIVED from the
     * rehydrated profiles (see deriveGate in store.ts) — the rehydrate itself
     * is the only store mutation, and it lands before the first paint. A
     * second state flip inside this layout effect re-rendered mid-hydration
     * (selective hydration) and resurrected the Radix useId mismatch. */
  }, []);

  /* Shared links may arrive as /?go=movie/155 (query deep-links are visible to
   * the server, so they carry per-title OG cards). Convert once on mount:
   * move the target into the hash route and strip the query from the URL. */
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const go = sp.get("go");
    if (!go) return;
    sp.delete("go");
    const qs = sp.toString();
    history.replaceState(
      null,
      "",
      window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash
    );
    if (/^(movie|tv)\/\d+$/.test(go)) {
      window.location.hash = `#/${go}`;
    }
  }, []);

  useEffect(() => {
    /* PWA offline shell — production only, dev HMR stays untouched. */
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "/" && !isTypingTarget(e)) {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "?" && !isTypingTarget(e)) {
        e.preventDefault();
        setSearchOpen(false);
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const immersive = route.name === "play";
  const gate = useReelivo((s) => s.gate);
  const profiles = useReelivo((s) => s.profiles);
  const activeProfileId = useReelivo((s) => s.activeProfileId);
  const unlocked = useReelivo((s) => s.unlocked);
  const miniStream = useReelivo((s) => s.miniStream);
  const gateMode = deriveGate(gate, profiles, activeProfileId, unlocked);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen flex-col bg-background">
        {!immersive && <TopBar route={route as Route} onOpenSearch={() => setSearchOpen(true)} />}
        {!immersive && <ScrollProgress />}
        <main id="main" className="flex-1">
          {/* keyed hand-off: a soft cut between views; genre/chip changes keep
            * the same key so browsing never re-fades mid-flow */}
          <div key={route.name} className={immersive ? "" : "view-in"}>
            {route.name === "home" && <HomeView />}
            {route.name === "films" && (
              <BrowseView kind="movie" key="films" genreSlug={route.genre} modeSlug={route.mode} />
            )}
            {route.name === "series" && (
              <BrowseView kind="tv" key="series" genreSlug={route.genre} modeSlug={route.mode} />
            )}
            {route.name === "services" && <ServicesView />}
            {route.name === "watchlist" && <WatchlistView />}
            {route.name === "history" && <HistoryView />}
            {route.name === "calendar" && <CalendarView />}
            {route.name === "shared" && <SharedListView />}
            {route.name === "detail" && <DetailView type={route.type} id={route.id} />}
            {route.name === "person" && <PersonView id={route.id} rank={route.rank} />}
            {route.name === "director" && <DirectorView id={route.id} />}
            {route.name === "collection" && <CollectionView id={route.id} />}
            {route.name === "play" && (
              <PlayerView type={route.type} id={route.id} season={route.season} episode={route.episode} />
            )}
          </div>
        </main>
        {!immersive && (
          <Footer onShowShortcuts={() => setShortcutsOpen(true)} />
        )}
        {!immersive && <MobileNav route={route as Route} onOpenSearch={() => setSearchOpen(true)} />}
        {!immersive && <BackToTop />}
        {!immersive && <InstallPill />}
        {/* Continue-anywhere mini card (Task 32 wave 3-a): only outside the
         * immersive play route, only once the profile gate is through, and
         * only when 3-b's player parked a stream — miniStream is ephemeral
         * (never persisted), so it is hydration-safe by construction. */}
        {!immersive && gateMode === "off" && miniStream && <MiniPlayer />}
        {!immersive && <div className="h-14 md:hidden" aria-hidden />}
        <SearchDialog
          open={searchOpen}
          onOpenChange={setSearchOpen}
          onShowShortcuts={() => setShortcutsOpen(true)}
        />
        <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
        <FolderPicker />
        <ProfileEditor />
        <ProfilePinDialog />
        {gateMode !== "off" && <ProfileGate />}
      </div>
    </QueryClientProvider>
  );
}
