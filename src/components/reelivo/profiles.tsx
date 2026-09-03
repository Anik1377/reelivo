"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LockKeyhole, Pencil, Plus, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useReelivo, type Profile } from "@/lib/store";
import { isFourDigits, pinHash } from "@/lib/pin";
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
/* Eight built-in character portraits (public/avatars) — friendly faces in the
 * spirit of Prime-style profile walls, drawn as one cohesive set. Each keeps
 * a gradient twin as the loading/fallback skin so tiles never flash empty. */

export const AVATARS: { src: string; label: string; tile: string }[] = [
  { src: "/avatars/av-1.png", label: "Popcorn buddy", tile: "from-[#0ea5c6] to-[#0b5a72]" },
  { src: "/avatars/av-2.png", label: "Director buddy", tile: "from-amber-400 to-amber-700" },
  { src: "/avatars/av-3.png", label: "Astro cat", tile: "from-emerald-400 to-emerald-700" },
  { src: "/avatars/av-4.png", label: "Retro robot", tile: "from-cyan-400 to-cyan-700" },
  { src: "/avatars/av-5.png", label: "Cozy ghost", tile: "from-violet-400 to-violet-700" },
  { src: "/avatars/av-6.png", label: "Cinema fox", tile: "from-orange-400 to-red-600" },
  { src: "/avatars/av-7.png", label: "Sleepy sloth", tile: "from-lime-400 to-lime-700" },
  { src: "/avatars/av-8.png", label: "Curious alien", tile: "from-fuchsia-400 to-fuchsia-700" },
];

const avatarOf = (p: Profile | undefined) =>
  AVATARS[((p?.avatar ?? 0) % AVATARS.length + AVATARS.length) % AVATARS.length];

export function ProfileAvatar({
  profile,
  className = "size-8",
}: {
  profile: Profile | undefined;
  className?: string;
}) {
  if (!profile) {
    return (
      <span
        aria-hidden
        className={`grid shrink-0 place-items-center rounded-full bg-white/[0.08] text-white/50 ${className}`}
      >
        <UserRound className="size-1/2" />
      </span>
    );
  }
  const av = avatarOf(profile);
  return (
    <span
      aria-hidden
      className={`relative block shrink-0 overflow-hidden rounded-full bg-gradient-to-br ${av.tile} ${className}`}
    >
      <img src={av.src} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
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

/* ------------------------------- PIN unlock -------------------------------- */
/* A locked profile asks for its four digits before it opens. One shared
 * dialog serves every doorway: the gate wall, manage mode, the top-bar
 * switcher. The hash is verified locally (lib/pin.ts) — nothing leaves home. */

type PinRequest = { profileId: string; purpose: "switch" | "edit" } | null;

let pinReq: PinRequest = null;
const pinListeners = new Set<() => void>();

function notifyPin() {
  for (const l of pinListeners) l();
}

export function openProfilePin(req: Exclude<PinRequest, null>) {
  pinReq = req;
  notifyPin();
}

function closeProfilePin() {
  pinReq = null;
  notifyPin();
}

function subscribePin(onChange: () => void) {
  pinListeners.add(onChange);
  return () => {
    pinListeners.delete(onChange);
  };
}

const pinSnapshot = () => pinReq;
const pinServer = () => null;

function useProfilePin(): PinRequest {
  return useSyncExternalStore(subscribePin, pinSnapshot, pinServer);
}

export function ProfilePinDialog() {
  const req = useProfilePin();
  const profiles = useReelivo((s) => s.profiles);
  const profile = req ? profiles.find((p) => p.id === req.profileId) : undefined;

  return (
    <Dialog
      open={req !== null && !!profile}
      onOpenChange={(v) => {
        if (!v) closeProfilePin();
      }}
    >
      <DialogContent className="max-w-[320px] border-white/10 bg-popover p-0">
        {req && profile && (
          <PinBody key={`${req.profileId}-${req.purpose}`} profile={profile} purpose={req.purpose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PinBody({
  profile,
  purpose,
}: {
  profile: Profile;
  purpose: "switch" | "edit";
}) {
  const switchProfile = useReelivo((s) => s.switchProfile);
  const setProfilePin = useReelivo((s) => s.setProfilePin);
  const markProfileUnlocked = useReelivo((s) => s.markProfileUnlocked);
  const av = avatarOf(profile);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [forgot, setForgot] = useState(false);

  const proceed = () => {
    closeProfilePin();
    markProfileUnlocked(profile.id); // this session: the derived wall stays closed for them
    if (purpose === "switch") {
      switchProfile(profile.id);
      toast(`Watching as ${profile.name}`, { duration: 2200 });
    } else {
      openProfileEditor({ mode: "edit", id: profile.id });
    }
  };

  const submit = async (candidate: string) => {
    const h = await pinHash(candidate, profile.id);
    if (h === profile.pin) {
      proceed();
      return;
    }
    setError("That PIN didn't match. Try again.");
    setShaking(true);
    setTimeout(() => setShaking(false), 480);
    setCode("");
  };

  const press = (digit: string) => {
    setError(null);
    const next = (code + digit).slice(0, 4);
    setCode(next);
    if (next.length === 4) void submit(next);
  };

  const backspace = () => setCode((c) => c.slice(0, -1));

  /* physical keyboards work too — digits, backspace, escape */
  const onKey = (e: React.KeyboardEvent) => {
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      press(e.key);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      backspace();
    }
  };

  const removeLock = () => {
    setProfilePin(profile.id, null);
    toast(`${profile.name}'s lock was removed`);
    proceed();
  };

  return (
    <div onKeyDown={onKey} tabIndex={-1}>
      <DialogHeader className="items-center border-b border-white/[0.06] px-5 pb-4 pt-5 text-center">
        <span
          aria-hidden
          className={`relative mx-auto block size-14 overflow-hidden rounded-full bg-gradient-to-br ${av.tile}`}
        >
          <img src={av.src} alt="" className="absolute inset-0 size-full object-cover" />
        </span>
        <DialogTitle className="display mt-2 text-center text-[16px]">
          {forgot ? `Remove ${profile.name}'s lock?` : `Enter ${profile.name}'s PIN`}
        </DialogTitle>
        <DialogDescription className="text-center text-[12.5px] leading-relaxed text-ink-dim">
          {forgot
            ? "The lock only lives in this browser — removing it opens the profile again."
            : purpose === "edit"
              ? "This profile is locked. Confirm the PIN to change it."
              : "This profile is locked — four digits and you're in."}
        </DialogDescription>
      </DialogHeader>

      {forgot ? (
        <div className="flex flex-col gap-2 px-5 py-4">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="h-9 text-xs"
            onClick={removeLock}
          >
            Remove the lock
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-ink-dim hover:text-white"
            onClick={() => setForgot(false)}
          >
            Keep it locked
          </Button>
        </div>
      ) : (
        <div className="px-5 py-4">
          {/* the four slots */}
          <div
            aria-hidden
            className={`mx-auto flex w-fit items-center gap-3 ${shaking ? "shake-x" : ""}`}
          >
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`size-3 rounded-full transition-all duration-150 ${
                  i < code.length
                    ? "scale-110 bg-primary shadow-[0_0_10px_rgba(0,168,225,0.55)]"
                    : "bg-white/15"
                }`}
              />
            ))}
          </div>
          <p aria-live="polite" className="mt-2 h-4 text-center text-[12px] text-red-400">
            {error ?? ""}
          </p>

          {/* keypad */}
          <div className="mx-auto mt-1 grid w-[216px] grid-cols-3 gap-2" role="group" aria-label="PIN keypad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button
                key={d}
                type="button"
                aria-label={`Digit ${d}`}
                onClick={() => press(d)}
                className="grid h-11 place-items-center rounded-xl border border-white/[0.08] bg-surface text-[16px] font-semibold text-white transition-colors duration-100 hover:border-white/25 hover:bg-surface-2 active:bg-white/10"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setForgot(true)}
              className="col-start-1 grid h-11 place-items-center rounded-xl text-[11px] font-semibold tracking-wide text-ink-dim transition-colors duration-100 hover:text-white"
            >
              Forgot?
            </button>
            <button
              type="button"
              aria-label="Digit 0"
              onClick={() => press("0")}
              className="grid h-11 place-items-center rounded-xl border border-white/[0.08] bg-surface text-[16px] font-semibold text-white transition-colors duration-100 hover:border-white/25 hover:bg-surface-2 active:bg-white/10"
            >
              0
            </button>
            <button
              type="button"
              aria-label="Delete last digit"
              onClick={backspace}
              className="grid h-11 place-items-center rounded-xl text-[11px] font-semibold tracking-wide text-ink-dim transition-colors duration-100 hover:text-white"
            >
              ⌫
            </button>
          </div>
        </div>
      )}
    </div>
  );
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
          Each profile keeps its own list, resume queue, history and lock — on this device only.
        </DialogDescription>
      </DialogHeader>

      <div className="max-h-[62vh] overflow-y-auto px-5 py-4">
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
            const selected = avatar === i;
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={av.label}
                onClick={() => setAvatar(i)}
                className={`relative aspect-square overflow-hidden rounded-2xl bg-gradient-to-br transition-all duration-150 ${av.tile} ${
                  selected
                    ? "scale-[1.04] ring-2 ring-primary/70"
                    : "opacity-60 hover:opacity-100 focus-visible:opacity-100"
                }`}
              >
                <img src={av.src} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
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

        {req.mode === "edit" && editing && <LockSection profile={editing} />}
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

/* ------------------------------ profile lock -------------------------------- */

function LockSection({ profile }: { profile: Profile }) {
  const setProfilePin = useReelivo((s) => s.setProfilePin);
  const locked = !!profile.pin;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const enable = async () => {
    if (!isFourDigits(draft)) return;
    setProfilePin(profile.id, await pinHash(draft, profile.id));
    setDraft("");
    setEditing(false);
    toast.success("Profile lock on — it will ask for the PIN before opening");
  };

  const remove = () => {
    setProfilePin(profile.id, null);
    setEditing(false);
    toast(`${profile.name}'s lock was removed`);
  };

  const draftOk = isFourDigits(draft);

  return (
    <div className="mt-2.5 rounded-xl border border-white/[0.07] bg-surface-2 px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <LockKeyhole
            className={`mt-0.5 size-4 shrink-0 ${locked ? "text-primary" : "text-ink-dim"}`}
            aria-hidden
          />
          <div>
            <p className="text-[13px] font-semibold">
              Profile lock {locked ? "· on" : "· off"}
            </p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-ink-dim">
              {locked
                ? "Asks for the four digits before this profile opens on this device."
                : "Keep this one private — a four-digit PIN before it opens."}
            </p>
          </div>
        </div>
        {!editing && (
          <div className="flex shrink-0 items-center gap-1">
            {locked && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11.5px] text-ink-dim hover:text-red-300"
                onClick={remove}
              >
                Remove
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11.5px] text-primary hover:bg-primary/10 hover:text-primary"
              onClick={() => setEditing(true)}
            >
              {locked ? "Change" : "Add PIN"}
            </Button>
          </div>
        )}
      </div>

      {editing && (
        <div className="mt-3 border-t border-white/[0.06] pt-3">
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={draft}
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 4))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void enable();
                }
              }}
              placeholder="••••"
              aria-label="Four digit PIN"
              className="h-9 w-24 border-white/10 bg-surface text-center text-[16px] font-semibold tracking-[0.4em] focus-visible:border-primary focus-visible:ring-0"
            />
            <Button
              type="button"
              size="sm"
              disabled={!draftOk}
              onClick={() => void enable()}
              className="h-8 px-3 text-xs"
            >
              {locked ? "Set PIN" : "Enable lock"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-ink-dim hover:text-white"
              onClick={() => {
                setEditing(false);
                setDraft("");
              }}
            >
              Cancel
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-ink-dim">
            {draft.length > 0 && !draftOk
              ? "Exactly four digits."
              : "Digits only, stored as a hash in this browser — a gentle lock, not security."}
          </p>
        </div>
      )}
    </div>
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
  const [avLoaded, setAvLoaded] = useState(false);
  const av = avatarOf(profile);
  /* the gradient twin shows while the portrait loads or if glass isn't available */
  const showFallback = !artReady || glassFailed || !avLoaded;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={
        manage
          ? `Edit ${profile.name}`
          : profile.pin
            ? `Continue as ${profile.name} — locked`
            : `Continue as ${profile.name}`
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
        {/* fallback skin — gradient twin + initial while art/portrait loads */}
        {showFallback && (
          <span
            aria-hidden
            className={`absolute inset-0 grid place-items-center rounded-full bg-gradient-to-br opacity-95 transition-opacity duration-300 ${av.tile}`}
          >
            <span className="display text-2xl font-extrabold text-white/90 md:text-3xl">
              {profile.name.slice(0, 1).toUpperCase()}
            </span>
          </span>
        )}
        <img
          src={av.src}
          alt=""
          loading="lazy"
          onLoad={() => setAvLoaded(true)}
          className="absolute inset-0 size-full rounded-full object-cover"
        />
        <span
          aria-hidden
          className="absolute inset-0 rounded-full ring-1 ring-white/25 transition-all duration-200 group-hover:ring-2 group-hover:ring-white/60"
        />
        {profile.kids && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-amber-300/50 bg-black px-2 py-px text-[9px] font-bold uppercase tracking-[0.14em] text-amber-300">
            Kids
          </span>
        )}
        {profile.pin && (
          <span className="absolute -right-1 -top-1 grid size-6 place-items-center rounded-full border border-white/25 bg-black">
            <LockKeyhole className="size-3 text-primary" aria-hidden />
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

  const openTile = (p: Profile) => {
    if (manage) {
      /* locked tiles verify their PIN before the editor opens */
      if (p.pin) openProfilePin({ profileId: p.id, purpose: "edit" });
      else openProfileEditor({ mode: "edit", id: p.id });
      return;
    }
    if (p.pin) {
      openProfilePin({ profileId: p.id, purpose: "switch" });
      return;
    }
    switchProfile(p.id);
    toast(`Watching as ${p.name}`, { duration: 2200 });
  };

  return (
    <div
      ref={gateRef}
      role="dialog"
      aria-modal="true"
      aria-label={onboarding ? "Create your first profile" : manage ? "Manage profiles" : "Who's watching"}
      className="fixed inset-0 z-50 overflow-y-auto bg-black pt-[env(safe-area-inset-top,0px)]"
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
              ? "Pick a tile to rename it, swap the portrait, lock it, or remove it altogether."
              : "Pick a profile — locked ones ask for their PIN first."}
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
                onOpen={() => openTile(p)}
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
