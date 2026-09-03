"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Play, RotateCcw, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { hrefFor, navigate } from "@/lib/hooks";
import { poster } from "@/lib/format";
import type { AiTitle, AskResponse } from "@/lib/ai-types";
import { Img, StillSkeleton } from "./bits";

/* Task 32 / wave 2-a — "Ask Reelivo": a controlled dialog that turns a plain
 * sentence into curated titles via POST /api/ai/ask. Honest loading (rotating
 * status lines + skeleton, NO fake progress bars), honest errors (inline note,
 * no console spam), honest AI framing (footnote on results). Kids profiles
 * never mount this (home.tsx guards it). */

const SUGGESTIONS = [
  "a mind-bending thriller under two hours",
  "something like Breaking Bad but funnier",
  "a feel-good 90s comedy",
];

/* Rotating while the pipeline thinks (LLM → discover → normalize can take a
 * few seconds). Pure theatre-free copy — one line at a time, aria-live. */
const STATUS_LINES = [
  "Reading your vibe…",
  "Browsing the archive…",
  "Matching the mood…",
  "Polishing the picks…",
];

/** Tasteful pill that opens the dialog — mounted on home's rails region. */
export function AskReelivoButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ask Reelivo — describe what you feel like watching and get picks"
      className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 text-[13px] font-semibold text-white transition-all duration-150 hover:border-primary/60 hover:bg-primary/10 hover:text-primary active:scale-[0.98]"
    >
      <Sparkles className="size-4 text-primary" aria-hidden />
      Ask Reelivo
    </button>
  );
}

function AskErrorNote({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  /* Same visual language as bits.tsx ErrorNote, ask-specific honest copy. */
  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface px-6 py-10 text-center">
      <span
        className="mx-auto grid size-12 place-items-center rounded-full bg-surface-2 ring-1 ring-white/[0.08]"
        aria-hidden
      >
        <RotateCcw className="size-5 text-ink-dim" />
      </span>
      <p className="mt-3 text-sm text-ink-dim">
        {message || "The ask didn't land — the reel snapped. Try again in a moment."}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}

function AskPosterCard({
  item,
  onLeave,
}: {
  item: AiTitle;
  onLeave: () => void;
}) {
  const go = (route: Parameters<typeof hrefFor>[0]) => {
    onLeave();
    navigate(hrefFor(route));
  };
  return (
    <article className="group">
      <div
        role="link"
        tabIndex={0}
        aria-label={`${item.title} — open details`}
        onClick={() =>
          go({ name: "detail", type: item.media_type, id: item.id })
        }
        onKeyDown={(e) => {
          if (e.key === "Enter")
            go({ name: "detail", type: item.media_type, id: item.id });
        }}
        className="relative aspect-[2/3] cursor-pointer overflow-hidden rounded-xl bg-surface-2 ring-1 ring-white/[0.06] transition-all duration-200 group-hover:ring-primary/70 group-focus-within:ring-primary/60 active:scale-[0.985]"
      >
        <Img
          src={poster(item.poster_path, "w342")}
          alt={item.title}
          fallbackTitle={item.title}
          sizesHint="(max-width: 640px) 45vw, 150px"
          className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            aria-label={`Play ${item.title} free`}
            onClick={(e) => {
              e.stopPropagation();
              go({ name: "play", type: item.media_type, id: item.id });
            }}
            className="grid size-11 place-items-center rounded-full bg-white text-black shadow-[0_8px_28px_rgba(0,0,0,0.55)] transition-transform duration-150 hover:scale-105 active:scale-95"
          >
            <Play className="ml-0.5 size-5 fill-current" aria-hidden />
          </button>
        </div>
      </div>
      <p className="mt-2 truncate text-[13px] font-semibold leading-tight text-foreground">
        {item.title}
      </p>
      <p className="mt-0.5 truncate text-xs text-ink-dim">
        {item.year || "—"} · {item.media_type === "movie" ? "Film" : "Series"}
      </p>
    </article>
  );
}

function SkeletonGrid() {
  return (
    <div
      className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 md:grid-cols-4"
      aria-hidden
    >
      {Array.from({ length: 8 }, (_, i) => (
        <StillSkeleton key={i} className="aspect-[2/3] w-full" />
      ))}
    </div>
  );
}

function AskBody({ onLeave }: { onLeave: () => void }) {
  /* Lives INSIDE DialogContent — unmounts on close, so every open starts a
   * fresh form (no reset effects, no cascading setState — the house lint rule
   * would flag those). The mutation dying with the dialog is by design:
   * a half-finished ask is abandoned when the user walks away. */
  const [query, setQuery] = useState("");
  const [statusIdx, setStatusIdx] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const ask = useMutation({
    mutationFn: async (q: string): Promise<AskResponse> => {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const json = (await res.json().catch(() => null)) as
        | (AskResponse & { error?: string })
        | null;
      if (!res.ok || !json || !Array.isArray(json.results)) {
        throw new Error(
          typeof json?.error === "string" && json.error ? json.error : ""
        );
      }
      return json;
    },
  });

  /* derived before the effects below read it */
  const results = ask.data?.results ?? [];
  const showForm = !ask.isPending && !ask.data && !ask.isError;

  /* focus the prompt whenever the form is on screen: this body mounts on
   * open, AND "Ask again" swaps the results view back for the form — without
   * this, focus would die on the button that unmounts underneath it. */
  useEffect(() => {
    if (showForm) inputRef.current?.focus();
  }, [showForm]);

  /* rotate the status line while the pipeline thinks — no fake progress bars */
  useEffect(() => {
    if (!ask.isPending) return;
    const t = setInterval(
      () => setStatusIdx((i) => (i + 1) % STATUS_LINES.length),
      2400
    );
    return () => clearInterval(t);
  }, [ask.isPending]);

  const submit = (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2 || ask.isPending) return;
    setStatusIdx(0); // every ask narrates from the top
    ask.mutate(trimmed);
  };

  return (
    <>
      {showForm && (
        <form
          className="px-5 pb-5 pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(query);
          }}
        >
          <textarea
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit(query);
              }
            }}
            rows={3}
            maxLength={300}
            aria-label="Describe what you feel like watching"
            placeholder="e.g. a slow-burn mystery with a strong lead and rain-soaked streets"
            className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[14.5px] leading-relaxed text-foreground outline-none placeholder:text-ink-dim/60 focus:border-primary/60"
          />
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="kicker text-ink-dim">Try</span>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setQuery(s);
                    submit(s);
                  }}
                  className="inline-flex h-11 items-center whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-3.5 text-[12.5px] font-medium text-ink-dim transition-all duration-150 hover:border-white/25 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              type="submit"
              disabled={query.trim().length < 2}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-primary px-5 text-[13.5px] font-bold text-primary-foreground transition-all duration-150 hover:-translate-y-px hover:shadow-[0_10px_28px_rgba(0,168,225,0.35)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              Find it
            </button>
          </div>
        </form>
      )}

      {ask.isPending && (
        <div
          className="border-t border-white/[0.07] px-5 py-5"
          aria-live="polite"
        >
          <p className="flex items-center gap-2.5 text-[14px] font-semibold text-primary">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            <span>{STATUS_LINES[statusIdx]}</span>
          </p>
          <p className="sr-only">Finding titles, this can take a few seconds</p>
          <div className="mt-4">
            <SkeletonGrid />
          </div>
        </div>
      )}

      {ask.isError && (
        <div className="px-5 pb-5 pt-4">
          <AskErrorNote
            message={
              ask.error instanceof Error && ask.error.message
                ? ask.error.message
                : undefined
            }
            onRetry={() => submit(query)}
          />
        </div>
      )}

      {ask.data && (
        <div className="styled-scrollbar max-h-[58vh] overflow-y-auto overscroll-contain border-t border-white/[0.07] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="max-w-md text-[14.5px] leading-relaxed text-white/85">
                {ask.data.blurb}
              </p>
              {(ask.data.labels?.length ?? 0) > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {ask.data.labels.map((l) => (
                    <span
                      key={l}
                      className="chip-glass rounded-full px-2.5 py-1 text-[11px] font-semibold text-white/85"
                    >
                      {l}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                ask.reset();
                setQuery("");
              }}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 text-[13px] font-semibold text-white/85 transition-all duration-150 hover:border-white/30 hover:text-white"
            >
              <RotateCcw className="size-3.5" aria-hidden />
              Ask again
            </button>
          </div>

          {results.length === 0 ? (
            <p className="px-1 py-10 text-center text-sm text-ink-dim">
              Nothing surfaced for that ask — try describing it another way.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 md:grid-cols-4">
              {results.map((t) => (
                <AskPosterCard
                  key={`${t.media_type}-${t.id}`}
                  item={t}
                  onLeave={onLeave}
                />
              ))}
            </div>
          )}
          <p className="mt-4 text-[11px] text-ink-dim">
            AI-curated from your description · titles via TMDB · may miss
            sometimes
          </p>
        </div>
      )}
    </>
  );
}

export function AskReelivoDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[7vh] left-1/2 max-h-[86svh] -translate-x-1/2 translate-y-0 gap-0 overflow-hidden rounded-2xl border-white/10 bg-popover p-0 shadow-[0_32px_80px_rgba(0,0,0,0.8)] sm:max-w-2xl"
      >
        <div className="px-5 pt-5">
          <DialogTitle className="display text-[22px] leading-tight text-foreground">
            Ask Reelivo
          </DialogTitle>
          <DialogDescription className="mt-1 text-[13.5px] text-ink-dim">
            Describe it — we&apos;ll find it
          </DialogDescription>
        </div>
        {/* mounts only while open → every ask starts fresh, nothing resets */}
        {open && <AskBody onLeave={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
