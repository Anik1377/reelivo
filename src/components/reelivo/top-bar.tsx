"use client";

import { useEffect, useState } from "react";
import { Bookmark, Check, History, LockKeyhole, Pencil, Plus, Search, UserRound } from "lucide-react";
import { hrefFor, navigate, type Route } from "@/lib/hooks";
import { useReelivo } from "@/lib/store";
import { useMounted } from "./media";
import { Kbd } from "./bits";
import { ProfileAvatar, openProfileEditor, openProfilePin } from "./profiles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LINKS: { key: Route["name"]; label: string; href: string }[] = [
  { key: "home", label: "Home", href: "#/" },
  { key: "films", label: "Films", href: "#/films" },
  { key: "series", label: "Series", href: "#/series" },
  { key: "services", label: "Services", href: "#/services" },
];

export function TopBar({
  route,
  onOpenSearch,
}: {
  route: Route;
  onOpenSearch: () => void;
}) {
  const mounted = useMounted();
  const listCount = useReelivo((s) => s.watchlist.length);
  const profiles = useReelivo((s) => s.profiles);
  const activeProfileId = useReelivo((s) => s.activeProfileId);
  const switchProfile = useReelivo((s) => s.switchProfile);
  const openGate = useReelivo((s) => s.openGate);
  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const [scrolled, setScrolled] = useState(false);
  // immersive chrome — fade the bar away while reading down, bring it back
  // the instant intent reverses; keyboard focus always pins it visible.
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 24);
      const dy = y - lastY;
      lastY = y;
      if (y < 140) setHidden(false);
      else if (dy > 8) setHidden(true);
      else if (dy < -8) setHidden(false);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (key: Route["name"]) => route.name === key;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-all duration-300 ease-out focus-within:translate-y-0 ${
        hidden ? "-translate-y-full" : "translate-y-0"
      } ${
        scrolled
          ? "border-b border-white/[0.06] bg-black/85 backdrop-blur-md"
          : "border-b border-transparent bg-gradient-to-b from-black/70 to-transparent"
      }`}
    >
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-4 px-4 md:h-16 md:px-8 2xl:max-w-[1720px]">
        <div className="flex items-center gap-8">
          <a
            href="#/"
            onClick={() => navigate("#/")}
            className="display text-[20px] leading-none tracking-tight text-white"
            aria-label="Reelivo home"
          >
            reelivo<span className="text-primary">.</span>
          </a>
          <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
            {LINKS.map((l) => (
              <a
                key={l.key}
                href={l.href}
                aria-current={isActive(l.key) ? "page" : undefined}
                className={`text-[13.5px] font-medium tracking-wide transition-colors duration-150 ${
                  isActive(l.key)
                    ? "font-semibold text-white"
                    : "text-white/60 hover:text-white"
                }`}
              >
                {l.label}
                <span
                  aria-hidden
                  className={`-mt-0.5 block h-0.5 rounded-full bg-primary transition-all duration-200 ${
                    isActive(l.key) ? "opacity-100" : "opacity-0"
                  }`}
                />
              </a>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenSearch}
            className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-1.5 text-[13px] text-white/60 transition-colors duration-150 hover:border-white/25 hover:text-white sm:flex"
            aria-label="Search titles"
          >
            <Search className="size-3.5" aria-hidden />
            <span>Search</span>
            <span className="ml-3 flex gap-1">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Search titles"
            className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-white/70 hover:border-white/25 hover:text-white sm:hidden"
          >
            <Search className="size-4" aria-hidden />
          </button>
          <a
            href={hrefFor({ name: "watchlist" })}
            className="relative grid size-9 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-white/70 transition-colors duration-150 hover:border-white/25 hover:text-white"
            aria-label={`Your list${mounted && listCount ? `, ${listCount} saved` : ""}`}
          >
            <Bookmark className="size-4" aria-hidden />
            {mounted && listCount > 0 && (
              <span className="tabular absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[9.5px] font-bold text-primary-foreground">
                {listCount}
              </span>
            )}
          </a>
          {/* profile switcher — the whole point of profiles is fast person-swapping */}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={activeProfile ? `Profile: ${activeProfile.name}` : "Choose profile"}
              className="rounded-full transition-transform duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              {mounted ? (
                <ProfileAvatar profile={activeProfile} className="size-9" />
              ) : (
                <span className="grid size-9 place-items-center rounded-full bg-white/[0.06] text-white/50">
                  <UserRound className="size-4" aria-hidden />
                </span>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={10}
              className="w-52 border-white/10 bg-popover/95 backdrop-blur-md"
            >
              <DropdownMenuLabel className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink-dim">
                Who's watching
              </DropdownMenuLabel>
              {profiles.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => {
                    /* locked profiles verify their PIN before the swap */
                    if (p.pin) openProfilePin({ profileId: p.id, purpose: "switch" });
                    else switchProfile(p.id);
                  }}
                  className="gap-2.5 rounded-lg py-2 text-[13px]"
                >
                  <ProfileAvatar profile={p} className="size-6" />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {p.pin && <LockKeyhole className="size-3.5 text-ink-dim" aria-label="Locked" aria-hidden />}
                  {p.id === activeProfileId && !p.pin && (
                    <Check className="size-3.5 text-primary" aria-hidden />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-white/[0.07]" />
              <DropdownMenuItem
                onClick={() => navigate(hrefFor({ name: "history" }))}
                className="gap-2.5 rounded-lg py-2 text-[13px]"
              >
                <History className="size-4 text-ink-dim" aria-hidden />
                Viewing history
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => openProfileEditor({ mode: "create" })}
                className="gap-2.5 rounded-lg py-2 text-[13px]"
              >
                <Plus className="size-4 text-primary" aria-hidden />
                New profile
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => openGate("manage")}
                className="gap-2.5 rounded-lg py-2 text-[13px]"
              >
                <Pencil className="size-4 text-ink-dim" aria-hidden />
                Manage profiles
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <a
        href="#/"
        onClick={() => navigate("#/")}
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-1 focus:text-primary-foreground"
      >
        Skip to content
      </a>
    </header>
  );
}
