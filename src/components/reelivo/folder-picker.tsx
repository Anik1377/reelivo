"use client";

import { useSyncExternalStore } from "react";
import { Check, Folder, ListPlus } from "lucide-react";
import { toast } from "sonner";
import type { MediaType } from "@/lib/tmdb-types";
import { useReelivo } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";

/* A tiny module-level store so any SaveButton anywhere can open ONE shared
 * picker without re-rendering the whole rail — cards just fire and forget. */

type PickTarget = { id: number; type: MediaType; title: string };

let pickerItem: PickTarget | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

/** Open the shared "File into…" picker for a saved title. */
export function openFolderPicker(item: PickTarget) {
  pickerItem = { ...item };
  notify();
}

function closePicker() {
  pickerItem = null;
  notify();
}

function subscribePicker(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function pickerSnapshot() {
  return pickerItem;
}

const pickerServer = () => null;

function usePickerItem(): PickTarget | null {
  return useSyncExternalStore(subscribePicker, pickerSnapshot, pickerServer);
}

/* ------------------------------- the dialog -------------------------------- */

export function FolderPicker() {
  const target = usePickerItem();
  const open = target !== null;

  const watchlist = useReelivo((s) => s.watchlist);
  const moveToFolder = useReelivo((s) => s.moveToFolder);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // current folder of the saved title (undefined = My list)
  const current = target
    ? watchlist.find((w) => w.id === target.id && w.type === target.type)?.folder
    : undefined;
  const folders = [...new Set(watchlist.map((w) => w.folder).filter((f): f is string => !!f))].sort(
    (a, b) => a.localeCompare(b)
  );

  const file = (folder: string | null) => {
    if (!target) return;
    moveToFolder(target.id, target.type, folder);
    toast.success(folder ? `Filed under “${folder}”` : "Kept in My list");
    closePicker();
  };

  const createAndFile = () => {
    const name = newName.trim().slice(0, 40);
    if (!name || !target) return;
    moveToFolder(target.id, target.type, name);
    toast.success(`Filed under “${name}”`);
    setNewName("");
    setCreating(false);
    closePicker();
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      closePicker();
      setCreating(false);
      setNewName("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm gap-0 border-white/10 bg-popover p-0">
        {target && (
          <>
            <DialogHeader className="border-b border-white/[0.06] px-5 pb-4 pt-5">
              <DialogTitle className="display text-left text-[17px] leading-snug">
                File <span className="text-primary">“{target.title}”</span>
              </DialogTitle>
              <DialogDescription className="text-left text-[13px] leading-relaxed text-ink-dim">
                Saved titles always land in My list first — pick a named list for it now.
              </DialogDescription>
            </DialogHeader>

            <div className="styled-scrollbar max-h-[46vh] overflow-y-auto p-2.5">
              <button
                type="button"
                onClick={() => file(null)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 hover:bg-surface-2"
              >
                <Bookmarkish />
                <span className="flex-1 text-[13.5px] font-medium">My list</span>
                {!current && <CheckMark />}
              </button>
              {folders.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => file(f)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 hover:bg-surface-2"
                >
                  <Folder className="size-4 shrink-0 text-primary/80" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{f}</span>
                  {current === f && <CheckMark />}
                </button>
              ))}

              {creating ? (
                <div className="mt-1 rounded-lg border border-white/10 bg-surface-2 p-2.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
                    New list name
                  </label>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      autoFocus
                      value={newName}
                      maxLength={40}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          createAndFile();
                        }
                        if (e.key === "Escape") setCreating(false);
                      }}
                      placeholder="Weekend marathon…"
                      className="min-w-0 flex-1 rounded-md border border-white/10 bg-surface px-2.5 py-1.5 text-[13px] text-foreground outline-none placeholder:text-ink-dim/50 focus-visible:border-primary"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={!newName.trim()}
                      onClick={createAndFile}
                      className="h-8 px-3 text-xs"
                    >
                      Add
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 hover:bg-surface-2"
                >
                  <span className="grid size-4 shrink-0 place-items-center rounded border border-dashed border-white/25 text-ink-dim">
                    <ListPlus className="size-3" aria-hidden />
                  </span>
                  <span className="flex-1 text-[13.5px] font-medium text-primary">
                    + New list…
                  </span>
                </button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Bookmarkish() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-4 shrink-0 text-primary/80"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
    </svg>
  );
}

function CheckMark() {
  return <Check className="size-3.5 text-primary" strokeWidth={3} aria-hidden />;
}

