"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * Trailer playback in a user-initiated dialog.
 * Uses youtube-nocookie embeds (privacy-enhanced), autoplay on because the
 * user explicitly asked to watch the trailer.
 */
export function TrailerDialog({
  open,
  onOpenChange,
  videoKey,
  title,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  videoKey: string | null;
  title: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="left-1/2 top-1/2 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-0 overflow-hidden rounded-2xl border-white/10 bg-black p-0 shadow-[0_40px_120px_rgba(0,0,0,0.9)] sm:max-w-3xl"
      >
        <DialogTitle className="sr-only">Trailer — {title}</DialogTitle>
        <div className="relative aspect-video w-full bg-black">
          {open && videoKey ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${videoKey}?autoplay=1&rel=0&modestbranding=1`}
              title={`${title} — trailer`}
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 h-full w-full border-0"
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
