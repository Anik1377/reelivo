"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

/* beforeinstallprompt is a non-standard event; type it locally. */
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * One quiet "Install Reelivo" affordance, bottom-left, only when the browser
 * exposes the PWA install flow and the app isn't already installed. Dismissal
 * sticks for the session.
 */
export function InstallPill() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallEvent);
      setDismissed(sessionStorage.getItem("reelivo-install-dismissed") === "1");
    };
    const onInstalled = () => setEvt(null);

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!evt || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full border border-white/10 bg-surface/95 py-1.5 pl-4 pr-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.55)] backdrop-blur animate-in fade-in slide-in-from-bottom-2">
      <p className="text-[12.5px] text-ink-dim">
        <span className="font-semibold text-foreground">Install Reelivo</span>
        <span className="hidden sm:inline"> — full screen, no chrome</span>
      </p>
      <button
        type="button"
        onClick={() => {
          evt.prompt().catch(() => undefined);
          setDismissed(true);
        }}
        className="flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-[12px] font-bold text-primary-foreground transition-transform duration-150 hover:scale-[1.03]"
      >
        <Download className="size-3.5" aria-hidden />
        Install
      </button>
      <button
        type="button"
        aria-label="Dismiss install suggestion"
        onClick={() => {
          sessionStorage.setItem("reelivo-install-dismissed", "1");
          setDismissed(true);
        }}
        className="grid size-7 place-items-center rounded-full text-ink-dim transition-colors hover:text-foreground"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
