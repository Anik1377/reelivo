"use client";

const QUICK_LINKS: { href: string; label: string }[] = [
  { href: "#/films", label: "Films" },
  { href: "#/series", label: "Series" },
  { href: "#/films/acclaimed", label: "Acclaimed" },
  { href: "#/services", label: "Services" },
  { href: "#/watchlist", label: "Your list" },
];

export function Footer({ onShowShortcuts }: { onShowShortcuts?: () => void }) {
  return (
    <footer className="mt-auto border-t border-white/[0.06]">
      <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-8 2xl:max-w-[1720px]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <p className="display text-sm tracking-tight text-white/90">
            reelivo<span className="text-primary">.</span>
            <span className="ml-2.5 font-sans text-xs font-normal text-ink-dim">
              Where to watch, tonight.
            </span>
          </p>
          <nav aria-label="Footer" className="no-scrollbar -mx-1 flex gap-0.5 overflow-x-auto">
            {QUICK_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-ink-dim transition-colors duration-150 hover:bg-white/[0.05] hover:text-foreground"
              >
                {l.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="mt-4 flex flex-col gap-1.5 border-t border-white/[0.05] pt-4 text-xs text-ink-dim md:flex-row md:items-center md:justify-between">
          <p className="leading-relaxed">
            Metadata &amp; artwork by{" "}
            <a
              href="https://www.themoviedb.org"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-white/20 underline-offset-4 transition-colors hover:text-foreground"
            >
              TMDB
            </a>{" "}
            · Playback by{" "}
            <a
              href="https://www.videasy.to"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-white/20 underline-offset-4 transition-colors hover:text-foreground"
            >
              Videasy
            </a>{" "}
            · Streams are free, ad-supported.
          </p>
          {onShowShortcuts && (
            <button
              type="button"
              onClick={onShowShortcuts}
              className="text-left text-[11.5px] text-ink-dim/80 transition-colors hover:text-primary md:text-right"
            >
              Keyboard shortcuts available — press ?
            </button>
          )}
        </div>
      </div>
    </footer>
  );
}
