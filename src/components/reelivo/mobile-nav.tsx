"use client";

import { Bookmark, Calendar, Clapperboard, Film, Search, Tv } from "lucide-react";
import type { Route } from "@/lib/hooks";
import { useReelivo } from "@/lib/store";

export function MobileNav({
  route,
  onOpenSearch,
}: {
  route: Route;
  onOpenSearch: () => void;
}) {
  const profiles = useReelivo((s) => s.profiles);
  const activeProfileId = useReelivo((s) => s.activeProfileId);
  /* Kids-mode nav shaping (Task 32 wave 3-a) — same data-level filter as the
   * desktop top bar. Services/Directors never were mobile-nav items (5-slot
   * bar), so the filter is a no-op today; the flag keeps desktop + mobile
   * consistent by construction if slots ever change. */
  const isKids = !!profiles.find((p) => p.id === activeProfileId)?.kids;

  const item = (
    label: string,
    icon: React.ReactNode,
    target: string,
    active: boolean,
    action?: () => void
  ) => (
    <a
      key={label}
      href={action ? undefined : target}
      onClick={
        action
          ? (e) => {
              e.preventDefault();
              action();
            }
          : undefined
      }
      aria-current={active ? "page" : undefined}
      className={`flex flex-col items-center gap-1 py-2.5 text-[10px] tracking-wide transition-colors duration-150 ${
        active ? "text-primary" : "text-white/50 hover:text-white"
      }`}
    >
      {icon}
      <span className="font-medium">{label}</span>
    </a>
  );

  /* Data-driven (mirrors TopBar's LINKS) so shaping is one .filter.
   * Calendar takes the sixth slot — 65px per tab at 390px, every target
   * still ≥44px tall and ≥44px wide. */
  type MobileNavItem = {
    label: string;
    icon: React.ReactNode;
    target: string;
    active: boolean;
    action?: () => void;
    adultOnly?: boolean;
  };
  const items: MobileNavItem[] = (
    [
      { label: "Home", icon: <Clapperboard className="size-5" aria-hidden />, target: "#/", active: route.name === "home" },
      { label: "Films", icon: <Film className="size-5" aria-hidden />, target: "#/films", active: route.name === "films" },
      { label: "Series", icon: <Tv className="size-5" aria-hidden />, target: "#/series", active: route.name === "series" },
      { label: "Calendar", icon: <Calendar className="size-5" aria-hidden />, target: "#/calendar", active: route.name === "calendar" },
      { label: "Search", icon: <Search className="size-5" aria-hidden />, target: "", active: false, action: onOpenSearch },
      { label: "List", icon: <Bookmark className="size-5" aria-hidden />, target: "#/watchlist", active: route.name === "watchlist" },
    ] as MobileNavItem[]
  ).filter((it) => !(isKids && it.adultOnly));

  return (
    <nav
      aria-label="Mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-black/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <div className="grid grid-cols-6">
        {items.map((it) => item(it.label, it.icon, it.target, it.active, it.action))}
      </div>
    </nav>
  );
}
