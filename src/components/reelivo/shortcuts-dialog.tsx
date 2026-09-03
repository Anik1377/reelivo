"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "./bits";

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["/", "⌘K"], label: "Search titles from anywhere" },
  { keys: ["↑", "↓"], label: "Move through search results" },
  { keys: ["↵"], label: "Open the selected title" },
  { keys: ["←", "→"], label: "Change hero slide (when the billboard is focused)" },
  { keys: ["←", "→"], label: "Move between cards in a rail" },
  { keys: ["Home", "End"], label: "First / last card in a rail" },
  { keys: ["esc"], label: "Close dialogs · back from the player" },
  { keys: ["?"], label: "Show this panel" },
];

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={false}
        className="left-1/2 top-1/2 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-0 rounded-2xl border-white/10 bg-popover p-0 shadow-[0_40px_120px_rgba(0,0,0,0.85)] sm:max-w-md"
      >
        <DialogTitle className="sr-only">Keyboard shortcuts</DialogTitle>
        <div className="border-b border-white/[0.07] px-6 pb-4 pt-5">
          <p className="kicker text-primary">Shortcuts</p>
          <h2 className="display mt-1 text-lg tracking-tight">Drive Reelivo from the keyboard</h2>
        </div>
        <ul className="px-2 py-2">
          {SHORTCUTS.map((s) => (
            <li
              key={s.label}
              className="flex items-center justify-between gap-4 rounded-lg px-4 py-2.5"
            >
              <span className="text-sm text-foreground/85">{s.label}</span>
              <span className="flex shrink-0 gap-1">
                {s.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="border-t border-white/[0.07] px-6 py-3.5 text-[11.5px] leading-relaxed text-ink-dim">
          Inside the stream, the player handles playback keys — Space (play/pause), F
          (fullscreen), M (mute).
        </p>
      </DialogContent>
    </Dialog>
  );
}
