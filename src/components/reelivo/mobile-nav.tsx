"use client";

import { Bookmark, Clapperboard, Film, Search, Tv } from "lucide-react";
import type { Route } from "@/lib/hooks";

export function MobileNav({
  route,
  onOpenSearch,
}: {
  route: Route;
  onOpenSearch: () => void;
}) {
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

  return (
    <nav
      aria-label="Mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-black/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <div className="grid grid-cols-5">
        {item("Home", <Clapperboard className="size-5" aria-hidden />, "#/", route.name === "home")}
        {item("Films", <Film className="size-5" aria-hidden />, "#/films", route.name === "films")}
        {item("Series", <Tv className="size-5" aria-hidden />, "#/series", route.name === "series")}
        {item("Search", <Search className="size-5" aria-hidden />, "", false, onOpenSearch)}
        {item("List", <Bookmark className="size-5" aria-hidden />, "#/watchlist", route.name === "watchlist")}
      </div>
    </nav>
  );
}
