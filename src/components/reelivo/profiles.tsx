"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Cat,
  Clapperboard,
  Drama,
  Ghost,
  Pencil,
  Plus,
  Popcorn,
  Rocket,
  Star,
  Ticket,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { useReelivo, type Profile } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTmdb } from "@/lib/hooks";
import { still } from "@/lib/format";
import type { Paged, MediaItem } from "@/lib/tmdb-types";
import { GlassLens } from "./liquid-glass";

/* -------------------------------- avatars ---------------------------------- */
/* Eight built-ins — gradient pair + glyph. No uploads, nothing personal
 * leaves the device; a gradient keeps the Who's-watching wall readable. */

export const AVATARS: { icon: typeof Clapperboard; tile: string; ring: string }[] = [
  { icon: Clapperboard, tile: "from-[#0ea5c6] to-[#0b5a72]", ring: "ring-[#22d3ee]/45" },
  { icon: Popcorn, tile: "from-amber-400 to-amber-700", ring: "ring-amber-300/45" },
  { icon: Rocket, tile: "from-rose-400 to-rose-700", ring: "ring-rose-300/45" },
  { icon: Ghost, tile: "from-violet-400 to-violet-700", ring: "ring-violet-300/45" },
  { icon: Cat, tile: "from-emerald-400 to-emerald-700", ring: "ring-emerald-300/45" },
  { icon: Ticket, tile: "from-orange-400 to-red-600", ring: "ring-orange-300/45" },
  { icon: Star, tile: "from-lime-400 to-lime-700", ring: "ring-lime-300/45" },
  { icon: Drama, tile: "from-fuchsia-400 to-fuchsia-700", ring: "ring-fuchsia-300/45" },
];

const avatarOf = (p: Profile | undefined) =>
  AVATARS[((p?.avatar ?? 0) % AVATARS.length + AVATARS.length) % AVATARS.length];

export function ProfileAvatar({
  profile,
  className = "size-8",
  iconClassName = "size-4",
}: {
  profile: Profile | undefined;
  className?: string;
  iconClassName?: string;
}) {
  const av = avatarOf(profile);
  const Icon = profile ? av.icon : UserRound;
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br text-white ${av.tile} ${className}`}
    >
      <Icon className={iconClassName} />
    </span>
  );
}

/* ----------------------------- editor mini-store ---------------------------- */
/* Same fire-and-forget seam as the folder picker: any surface (top-bar menu,
 * gate tiles) can open the ONE shared editor without prop drilling. */

type EditorRequest = { mode: "create" } | { mode: "edit"; id: string } | null;

let editorReq: EditorRequest = null;
const editorListeners = new Set<() => void>();

function notifyEditor() {
  for (const l of editorListeners) l();
}

export function openProfileEditor(req: Exclude<EditorRequest, null>) {
  editorReq = req;
  notifyEditor();
}

function closeProfileEditor() {
  editorReq = null;
  notifyEditor();
}

function subscribeEditor(onChange: () => void) {
  editorListeners.add(onChange);
  return () => editorListeners.delete(onChange);
}

const editorSnapshot = () => editorReq;
const editorServer = () => null;

function useProfileEditor(): EditorRequest {
  return useSyncExternalStore(subscribeEditor, editorSnapshot, editorServer);
}

/* ------------------------------ profile editor ------------------------------ */

export function ProfileEditor() {
  const req = useProfileEditor();
  const profiles = useReelivo((s) => s.profiles);
  const editing = req?.mode === "edit" ? profiles.find((p) => p.id === req.id) : undefined;

  /* Keying the body on the request remounts it per target, so the form
   * re-seeds itself through useState initializers — no reset effects. */
  const formKey = req ? (req.mode === "edit" ? `edit-${req.id}` : "create") : "closed";

  return (
    <Dialog
      open={req !== null}
      onOpenChange={(v) => {
        if (!v) closeProfileEditor();
      }}
    >
      <DialogContent className="max-w-[380px] gap-0 border-white/10 bg-popover p-0">
        {req && <EditorBody key={formKey} req={req} editing={editing} />}
      </DialogContent>
    </Dialog>
  );
}

function EditorBody({
  req,
  editing,
}: {
  req: Exclude<EditorRequest, null>;
  editing: Profile | undefined;
}) {
  const addProfile = useReelivo((s) => s.addProfile);
  const updateProfile = useReelivo((s) => s.updateProfile);
  const deleteProfile = useReelivo((s) => s.deleteProfile);
  const switchProfile = useReelivo((s) => s.switchProfile);

  const [name, setName] = useState(editing?.name ?? "");
  const [avatar, setAvatar] = useState(
    editing?.avatar ?? Math.floor(Math.random() * AVATARS.length)
  );
  const [kids, setKids] = useState(editing?.kids ?? false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = () => {
    const clean = name.trim();
    if (!clean) return;
    if (req.mode === "edit" && editing) {
      updateProfile(editing.id, { name: clean, avatar, kids });
      toast.success(`Profile updated — “${clean}”`);
    } else {
      const id = addProfile({ name: clean, avatar, kids });
      // first profile created from the gate: walk straight into the app
      if (!useReelivo.getState().activeProfileId) {
        switchProfile(id);
      }
      toast.success(`Welcome, ${clean}`);
    }
    closeProfileEditor();
  };

  const remove = () => {
    if (!editing) return;
    const gone = editing.name;
    deleteProfile(editing.id);
    closeProfileEditor();
    toast(`“${gone}” and their list were removed`);
    // deleting the active profile already re-opens the gate (store handles it)
  };

  return (
    <>
      <DialogHeader className="border-b border-white/[0.06] px-5 pb-4 pt-5">
        <DialogTitle className="display text-left text-[17px] leading-snug">
          {req.mode === "edit" ? "Edit profile" : "New profile"}
        </DialogTitle>
        <DialogDescription className="text-left text-[13px] leading-relaxed text-ink-dim">
          Each profile keeps its own list, resume queue and search history — on this device only.
        </DialogDescription>
      </DialogHeader>

      <div className="px-5 py-4">
        <Label htmlFor="profile-name" className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
          Name
        </Label>
        <Input
          id="profile-name"
          autoFocus
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
          placeholder="Roommate, kid, alter ego…"
          className="mt-1.5 h-9 border-white/10 bg-surface text-[13.5px] focus-visible:border-primary focus-visible:ring-0"
        />

        <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
          Avatar
        </p>
        <div role="radiogroup" aria-label="Avatar" className="mt-2 grid grid-cols-4 gap-2.5">
          {AVATARS.map((av, i) => {
            const Icon = av.icon;
            const selected = avatar === i;
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`Avatar ${i + 1}`}
                onClick={() => setAvatar(i)}
                className={`grid aspect-square place-items-center rounded-2xl bg-gradient-to-br transition-all duration-150 ${av.tile} ${
                  selected
                    ? `ring-2 ${av.ring} scale-[1.04]`
                    : "opacity-60 hover:opacity-100 focus-visible:opacity-100"
                }`}
              >
                <Icon className="size-5 text-white" aria-hidden />
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-surface-2 px-3.5 py-3">
          <div>
            <p className="text-[13px] font-semibold">Kids profile</p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-ink-dim">
              A bright badge on the tile so the little ones spot theirs first.
            </p>
          </div>
          <Switch checked={kids} onCheckedChange={setKids} aria-label="Kids profile" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] px-5 py-3.5">
        {req.mode === "edit" ? (
          confirmDelete ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={remove}
            >
              Really delete? Everything goes
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
              onClick={() => setConfirmDelete(true)}
            >
              Delete profile
            </Button>
          )
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-xs text-ink-dim hover:text-white"
            onClick={closeProfileEditor}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!name.trim()}
            onClick={save}
            className="h-8 px-4 text-xs"
          >
            {req.mode === "edit" ? "Save changes" : "Create profile"}
          </Button>
        </div>
      </div>
    </>
  );
}

/* ------------------------------ the gate wall ------------------------------- */

function TileName({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 truncate text-[13px] font-semibold text-white/85 transition-colors duration-150 group-hover:text-white">
      {children}
    </p>
  );
}

function GlassTile({
  profile,
  manage,
  backdropRef,
  gateRef,
  artReady,
  onOpen,
}: {
  profile: Profile;
  manage: boolean;
  backdropRef: React.RefObject<HTMLDivElement | null>;
  /** The gate root — the lens is reparented into it for correct stacking. */
  gateRef: React.RefObject<HTMLDivElement | null>;
  artReady: boolean;
  onOpen: () => void;
}) {
  const tileRef = useRef<HTMLDivElement>(null);
  const [glassFailed, setGlassFailed] = useState(false);
  const av = avatarOf(profile);
  const Icon = av.icon;
  const showFallback = !artReady || glassFailed;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={
        manage ? `Edit ${profile.name}` : `Continue as ${profile.name}`
      }
      className="group relative z-20 w-[104px] shrink-0 rounded-2xl p-1 text-center transition-transform duration-200 hover:scale-[1.05] focus-visible:scale-[1.05] md:w-[120px]"
    >
      <GlassLens
        targetRef={tileRef}
        backdropRef={backdropRef}
        layerRef={gateRef}
        active={artReady && !glassFailed}
        radius={999}
        onFailed={() => setGlassFailed(true)}
        opts={{
          scale: 22,
          depth: 26,
          curvature: 4,
          convexity: 1,
          chroma: 0.12,
          blur: 2,
          tint: 0.32,
          tintColor: "rgba(3,10,16,0.9)",
          edge: 0.6,
          specAngle: 140,
        }}
      />
      <div
        ref={tileRef}
        className="relative mx-auto size-[92px] md:size-[108px]"
      >
        {/* fallback skin — only while art loads or if glass isn't available */}
        {showFallback && (
          <span
            aria-hidden
            className={`absolute inset-0 rounded-full bg-gradient-to-br opacity-90 transition-opacity duration-300 ${av.tile}`}
          />
        )}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full ring-1 ring-white/25 transition-all duration-200 group-hover:ring-2 group-hover:ring-white/60"
        />
        <span className="absolute inset-0 grid place-items-center">
          <Icon className="size-8 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)] md:size-9" aria-hidden />
        </span>
        {profile.kids && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-amber-300/50 bg-black px-2 py-px text-[9px] font-bold uppercase tracking-[0.14em] text-amber-300">
            Kids
          </span>
        )}
        {manage && (
          <span className="absolute inset-0 grid place-items-center rounded-full bg-black/55 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
            <Pencil className="size-6 text-white" aria-hidden />
          </span>
        )}
      </div>
      <TileName>{profile.name}</TileName>
    </button>
  );
}

function AddTile({ onOpen, label = "New profile" }: { onOpen: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className="group relative z-30 w-[104px] shrink-0 rounded-2xl p-1 text-center transition-transform duration-200 hover:scale-[1.05] focus-visible:scale-[1.05] md:w-[120px]"
    >
      <div className="relative mx-auto grid size-[92px] place-items-center rounded-full border border-dashed border-white/30 bg-white/[0.04] backdrop-blur-sm transition-colors duration-200 group-hover:border-primary/70 group-hover:bg-primary/10 md:size-[108px]">
        <Plus className="size-8 text-white/60 transition-colors duration-200 group-hover:text-primary" aria-hidden />
      </div>
      <TileName>{label}</TileName>
    </button>
  );
}

export function ProfileGate() {
  const profiles = useReelivo((s) => s.profiles);
  const gate = useReelivo((s) => s.gate);
  const switchProfile = useReelivo((s) => s.switchProfile);
  const openGate = useReelivo((s) => s.openGate);
  const closeGate = useReelivo((s) => s.closeGate);

  const manage = gate === "manage";
  const gateRef = useRef<HTMLDivElement>(null);
  const trending = useTmdb<Paged<MediaItem>>("trending/all/week");
  const backdropPath = (trending.data?.results ?? []).find((i) => i.backdrop_path)?.backdrop_path ?? null;
  const backdropRef = useRef<HTMLDivElement>(null);
  /* Which art the lens may refract — derived from the loaded path, so a new
   * backdrop naturally re-gates readiness without a reset effect. */
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const artReady = backdropPath !== null && loadedPath === backdropPath;

  const onboarding = profiles.length === 0;

  return (
    <div
      ref={gateRef}
      role="dialog"
      aria-modal="true"
      aria-label={onboarding ? "Create your first profile" : manage ? "Manage profiles" : "Who's watching"}
      className="fixed inset-0 z-50 overflow-y-auto bg-black"
    >
      {/* the layer the glass lenses refract — real art, heavily dimmed */}
      <div ref={backdropRef} aria-hidden className="pointer-events-none absolute inset-0">
        {backdropPath && (
          <img
            src={still(backdropPath, "w780") ?? ""}
            alt=""
            className="h-full w-full object-cover opacity-30"
            onLoad={() => setLoadedPath(backdropPath)}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/35 to-black" />
      </div>

      <div className="relative flex min-h-full flex-col items-center justify-center px-6 py-16">
        <p className="kicker text-primary">Reelivo profiles</p>
        <h1 className="display mt-2 text-center text-[clamp(30px,5.5vw,52px)] leading-[1.05] text-white text-balance">
          {onboarding ? "Make yourself at home." : manage ? "Manage profiles" : "Who's watching?"}
        </h1>
        <p className="mt-2.5 max-w-md text-center text-[13.5px] leading-relaxed text-white/60">
          {onboarding
            ? "Create a profile to keep your list, resume queue and history separate — all stored on this device."
            : manage
              ? "Pick a tile to rename it, swap the avatar, or remove it altogether."
              : "Pick a profile — your list and resume queue are waiting."}
        </p>

        <div className="mt-10 flex flex-wrap items-start justify-center gap-5 md:gap-7">
          {profiles
            .slice()
            .sort((a, b) => Number(b.kids) - Number(a.kids) || a.createdAt - b.createdAt)
            .map((p) => (
              <GlassTile
                key={p.id}
                profile={p}
                manage={manage}
                backdropRef={backdropRef}
                gateRef={gateRef}
                artReady={artReady}
                onOpen={() => {
                  if (manage) openProfileEditor({ mode: "edit", id: p.id });
                  else {
                    switchProfile(p.id);
                    toast(`Watching as ${p.name}`, { duration: 2200 });
                  }
                }}
              />
            ))}
          {(onboarding || manage || profiles.length < 6) && (
            <AddTile onOpen={() => openProfileEditor({ mode: "create" })} />
          )}
        </div>

        {!onboarding && (
          <Button
            type="button"
            variant="outline"
            onClick={() => (manage ? closeGate() : openGate("manage"))}
            className="mt-12 rounded-full border-white/25 bg-white/[0.04] px-6 text-[13px] font-semibold tracking-wide text-white/80 hover:border-white/50 hover:bg-white/[0.08] hover:text-white"
          >
            {manage ? "Done" : "Manage profiles"}
          </Button>
        )}
        {onboarding && (
          <p className="mt-12 text-[11.5px] tracking-wide text-white/35">
            Local to this browser — no account, no sync, nothing leaves the device.
          </p>
        )}
      </div>
    </div>
  );
}
