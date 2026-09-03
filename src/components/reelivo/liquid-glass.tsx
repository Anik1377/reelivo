"use client";

import { useEffect, useRef, type RefObject } from "react";
import { LiquidGlass } from "liquid-glass-js";
import type { LiquidGlassParams } from "liquid-glass-js";

/* Thin React seam around liquid-glass-js. The library appends a fixed-position
 * lens (refracted clone of `background`) and a glass surface to <body>; this
 * component keeps one instance aligned over `targetRef` and tears it down on
 * unmount. It renders nothing itself — the host tile keeps its own fallback
 * styling, so a failed WebGL/canvas setup degrades to the plain look. */

type GlassOpts = Partial<LiquidGlassParams> & { zIndex?: number };

export function GlassLens({
  targetRef,
  backdropRef,
  layerRef,
  active,
  radius,
  opts,
  onFailed,
}: {
  targetRef: RefObject<HTMLElement | null>;
  /** The element the lens refracts (a backdrop layer with real imagery reads best). */
  backdropRef: RefObject<HTMLElement | null>;
  /** Optional ancestor to move the lens into. The library appends to <body>,
   * which paints it OUTSIDE any overlay's stacking context — reparenting into
   * the overlay (with a low z) puts the glass between art and tile chrome. */
  layerRef?: RefObject<HTMLElement | null>;
  /** Mount only once the background has finished loading — the clone snapshots it. */
  active: boolean;
  radius: number;
  opts?: GlassOpts;
  /** Called when the lens could not be created (no canvas, odd environment). */
  onFailed?: () => void;
}) {
  /* Params are treated as mount-time configuration: the ref snapshots the
   * first render's value only, so inline literals never tear the lens down. */
  const optsRef = useRef(opts);
  const failedRef = useRef(onFailed);

  useEffect(() => {
    if (!active) return;
    const host = targetRef.current;
    const background = backdropRef.current;
    if (!host || !background) return;

    let lg: LiquidGlass | null = null;
    try {
      const rect = host.getBoundingClientRect();
      lg = new LiquidGlass({
        background,
        draggable: false,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        radius: Math.round(radius),
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        zIndex: 20,
        ...optsRef.current,
      });
      /* The glass surface sits over the tile; non-draggable decor must never eat clicks. */
      const parts = lg as unknown as {
        lensEl?: HTMLElement;
        glassEl?: HTMLElement;
      };
      if (parts.glassEl) parts.glassEl.style.pointerEvents = "none";
      if (parts.lensEl) parts.lensEl.style.pointerEvents = "none";
      /* Reparent into the overlay so the glass interleaves correctly with it. */
      const layer = layerRef?.current;
      if (layer && parts.lensEl && parts.glassEl) {
        layer.appendChild(parts.lensEl);
        layer.appendChild(parts.glassEl);
        parts.lensEl.style.zIndex = "10";
        parts.glassEl.style.zIndex = "11";
      }

      const reposition = () => {
        const r = targetRef.current?.getBoundingClientRect();
        if (r) lg?.moveTo(Math.round(r.left), Math.round(r.top));
      };
      /* The library re-syncs its *background* on scroll/resize; the host tile's
       * own screen position is ours to maintain. */
      window.addEventListener("resize", reposition);
      const ro = new ResizeObserver(reposition);
      ro.observe(host);

      return () => {
        window.removeEventListener("resize", reposition);
        ro.disconnect();
        lg?.destroy();
        lg = null;
      };
    } catch {
      /* No canvas / odd environment — surface it so the tile can fall back. */
      failedRef.current?.();
      return;
    }
  }, [active, radius, targetRef, backdropRef, layerRef]);

  return null;
}
