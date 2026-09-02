"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowDownWideNarrow,
  Check,
  Dices,
  Download,
  Folder,
  FolderInput,
  Pencil,
  Play,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { hrefFor, navigate } from "@/lib/hooks";
import { poster, score, still } from "@/lib/format";
import { useReelivo, type SavedItem } from "@/lib/store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Chip, EmptyNote, Img, SectionHead } from "../bits";
import { useMounted } from "../media";

function ListRow({
  item,
  folders,
  onNewList,
}: {
  item: SavedItem;
  folders: string[];
  onNewList: (item: SavedItem) => void;
}) {
  const toggleWatchlist = useReelivo((s) => s.toggleWatchlist);
  const moveToFolder = useReelivo((s) => s.moveToFolder);
  const playHref = hrefFor({ name: "play", type: item.type, id: item.id });

  return (
    <li className="group flex items-center gap-4 rounded-lg border-b border-white/[0.06] px-2 py-3.5 transition-colors duration-150 last:border-0 hover:bg-white/[0.03] md:-mx-2 md:px-4">
      <Img
        src={poster(item.poster, "w185")}
        alt=""
        fallbackTitle={item.title}
        className="h-[84px] w-14 shrink-0 rounded-md object-cover"
      />
      <div
        role="link"
        tabIndex={0}
        onClick={() => navigate(hrefFor({ name: "detail", type: item.type, id: item.id }))}
        onKeyDown={(e) => {
          if (e.key === "Enter") navigate(hrefFor({ name: "detail", type: item.type, id: item.id }));
        }}
        className="min-w-0 flex-1 cursor-pointer"
      >
        <p className="truncate text-[14.5px] font-semibold text-foreground transition-colors group-hover:text-primary">
          {item.title}
        </p>
        <p className="mt-0.5 text-xs text-ink-dim">
          {item.year} · {item.type === "movie" ? "Film" : "Series"} · {score(item.rating)}
        </p>
        <p className="mt-1 flex items-center gap-2 text-[11px] text-ink-dim/70">
          {item.folder && (
            <span className="inline-flex max-w-[140px] items-center gap-1 rounded bg-white/[0.06] px-1.5 py-px text-[10px] font-medium text-ink-dim">
              <Folder className="size-2.5 shrink-0" aria-hidden />
              <span className="truncate">{item.folder}</span>
            </span>
          )}
          <span className="hidden sm:inline">
            Saved{" "}
            {new Date(item.addedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </span>
        </p>
      </div>
      <button
        type="button"
        aria-label={`Play ${item.title} free`}
        onClick={() => navigate(playHref)}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-black transition-transform duration-150 hover:scale-105 active:scale-95"
      >
        <Play className="ml-0.5 size-4 fill-current" aria-hidden />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`File ${item.title} into a list`}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 text-ink-dim transition-colors duration-150 hover:border-primary/60 hover:text-primary data-[state=open]:border-primary data-[state=open]:text-primary"
          >
            <FolderInput className="size-4" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="max-h-[60vh] w-52 overflow-y-auto border-white/10 bg-popover"
        >
          <DropdownMenuLabel className="text-[10px] tracking-[0.14em] text-ink-dim uppercase">
            File into
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => moveToFolder(item.id, item.type, null)}
            className="gap-2 text-[13px]"
          >
            <span className="flex-1">My list</span>
            {!item.folder && <Check className="size-3.5 text-primary" aria-hidden />}
          </DropdownMenuItem>
          {folders.map((f) => (
            <DropdownMenuItem
              key={f}
              onClick={() => moveToFolder(item.id, item.type, f)}
              className="gap-2 text-[13px]"
            >
              <Folder className="size-3.5 text-ink-dim" aria-hidden />
              <span className="flex-1 truncate">{f}</span>
              {item.folder === f && <Check className="size-3.5 text-primary" aria-hidden />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator className="bg-white/[0.08]" />
          <DropdownMenuItem onClick={() => onNewList(item)} className="gap-2 text-[13px]">
            <Plus className="size-3.5 text-primary" aria-hidden />
            New list…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        aria-label={`Remove ${item.title} from list`}
        onClick={() => {
          toggleWatchlist(item);
          toast.message("Removed from your list");
        }}
        className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 text-ink-dim transition-colors duration-150 hover:border-destructive hover:text-destructive"
      >
        <X className="size-4" aria-hidden />
      </button>
    </li>
  );
}

type ListFilter = "all" | "movie" | "tv";
type ListSort = "added" | "title" | "rating";
/** "" = My list (unfiled), "all" = no folder filter, otherwise a folder name. */
type FolderFilter = "all" | string;

const SORTS: { value: ListSort; label: string }[] = [
  { value: "added", label: "Recently added" },
  { value: "title", label: "A – Z" },
  { value: "rating", label: "Top rated" },
];

export function WatchlistView() {
  const mounted = useMounted();
  const watchlist = useReelivo((s) => s.watchlist);
  const importWatchlist = useReelivo((s) => s.importWatchlist);
  const clearWatchlist = useReelivo((s) => s.clearWatchlist);
  const moveToFolder = useReelivo((s) => s.moveToFolder);
  const renameFolder = useReelivo((s) => s.renameFolder);
  const deleteFolder = useReelivo((s) => s.deleteFolder);
  const [filter, setFilter] = useState<ListFilter>("all");
  const [folderFilter, setFolderFilter] = useState<FolderFilter>("all");
  const [sort, setSort] = useState<ListSort>("added");
  const [confirmClear, setConfirmClear] = useState(false);
  const [dialog, setDialog] = useState<{ mode: "create" | "rename"; folder?: string } | null>(null);
  const [pendingMove, setPendingMove] = useState<SavedItem | null>(null);
  const [dissolve, setDissolve] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const folders = useMemo(
    () =>
      [...new Set(watchlist.map((w) => w.folder).filter((f): f is string => !!f))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [watchlist]
  );

  const folderCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of watchlist) if (w.folder) map.set(w.folder, (map.get(w.folder) ?? 0) + 1);
    return map;
  }, [watchlist]);

  const myListCount = useMemo(() => watchlist.filter((w) => !w.folder).length, [watchlist]);

  const filtered = useMemo(() => {
    let list = watchlist;
    if (filter !== "all") list = list.filter((w) => w.type === filter);
    if (folderFilter === "") list = list.filter((w) => !w.folder);
    else if (folderFilter !== "all") list = list.filter((w) => w.folder === folderFilter);
    list = [...list];
    if (sort === "title") list.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "rating") list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    else list.sort((a, b) => b.addedAt - a.addedAt);
    return list;
  }, [watchlist, filter, folderFilter, sort]);

  const counts = useMemo(
    () => ({
      all: watchlist.length,
      movie: watchlist.filter((w) => w.type === "movie").length,
      tv: watchlist.filter((w) => w.type === "tv").length,
    }),
    [watchlist]
  );

  const surprise = useMemo(() => {
    return () => {
      if (filtered.length === 0) return;
      const pick = filtered[Math.floor(Math.random() * filtered.length)];
      toast(`Tonight's pick: ${pick.title}`, {
        description: "Rolled from your list — enjoy the show.",
      });
      navigate(
        hrefFor({
          name: "play",
          type: pick.type,
          id: pick.id,
        })
      );
    };
  }, [filtered]);

  const openCreate = (item?: SavedItem) => {
    setPendingMove(item ?? null);
    setNameDraft("");
    setDialog({ mode: "create" });
  };

  const openRename = (folder: string) => {
    setNameDraft(folder);
    setDialog({ mode: "rename", folder });
  };

  const submitDialog = () => {
    const name = nameDraft.trim().slice(0, 40);
    if (!name || !dialog) return;
    if (dialog.mode === "create") {
      if (pendingMove) {
        moveToFolder(pendingMove.id, pendingMove.type, name);
        toast.success(`“${pendingMove.title}” filed into ${name}`);
        setFolderFilter(name);
      } else {
        toast.success(`List “${name}” ready`, {
          description: "Use the folder icon on a title to file it here.",
        });
      }
    } else if (dialog.mode === "rename" && dialog.folder) {
      renameFolder(dialog.folder, name);
      if (folderFilter === dialog.folder) setFolderFilter(name);
      toast.success(`List renamed to “${name}”`);
    }
    setDialog(null);
    setPendingMove(null);
  };

  const confirmDissolve = () => {
    if (!dissolve) return;
    const count = folderCounts.get(dissolve) ?? 0;
    deleteFolder(dissolve);
    if (folderFilter === dissolve) setFolderFilter("all");
    setDissolve(null);
    toast.message(`List “${dissolve}” dissolved`, {
      description: `${count} ${count === 1 ? "title" : "titles"} moved back to My list.`,
    });
  };

  const exportList = () => {
    const payload = {
      app: "reelivo",
      version: 1,
      exportedAt: new Date().toISOString(),
      items: watchlist,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reelivo-watchlist-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${watchlist.length} ${watchlist.length === 1 ? "title" : "titles"}`);
  };

  const onImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { items?: SavedItem[] } | SavedItem[];
      const items = Array.isArray(parsed) ? parsed : (parsed.items ?? []);
      const added = importWatchlist(items);
      if (added > 0) {
        toast.success(`Imported ${added} new ${added === 1 ? "title" : "titles"}`);
      } else {
        toast.message("Nothing new to import", {
          description: "Everything in that file is already on your list (or invalid).",
        });
      }
    } catch {
      toast.error("Couldn't read that file", {
        description: "Expected a Reelivo watchlist export (.json).",
      });
    }
  };

  return (
    <div className="mx-auto max-w-[900px] px-4 pb-16 pt-24 md:px-8 md:pt-32 2xl:max-w-[1060px]">
      <SectionHead
        kicker="Saved for later"
        title="Your list"
        aside={
          mounted && filtered.length > 1 ? (
            <button
              type="button"
              onClick={surprise}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 text-[13px] font-semibold text-white transition-colors duration-150 hover:border-primary/60 hover:text-primary"
            >
              <Dices className="size-4" aria-hidden />
              Surprise me
            </button>
          ) : mounted ? (
            <span className="tabular text-xs text-ink-dim">
              {filtered.length} {filtered.length === 1 ? "title" : "titles"}
            </span>
          ) : null
        }
      />

      {/* filter + sort controls */}
      {mounted && watchlist.length > 0 && (
        <div className="mt-1 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter list">
              <Chip selected={filter === "all"} onClick={() => setFilter("all")}>
                All <span className="tabular opacity-60">{counts.all}</span>
              </Chip>
              <Chip selected={filter === "movie"} onClick={() => setFilter("movie")}>
                Films <span className="tabular opacity-60">{counts.movie}</span>
              </Chip>
              <Chip selected={filter === "tv"} onClick={() => setFilter("tv")}>
                Series <span className="tabular opacity-60">{counts.tv}</span>
              </Chip>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-ink-dim">
                <ArrowDownWideNarrow className="size-3.5" aria-hidden />
                <span className="sr-only">Sort list</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as ListSort)}
                  className="rounded-lg border border-white/10 bg-surface-2 px-2 py-1.5 text-xs text-foreground outline-none transition-colors focus-visible:border-primary"
                >
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <div
                className="flex items-center gap-1 rounded-lg border border-white/10 bg-surface px-1 py-1"
                role="group"
                aria-label="List data tools"
              >
                <button
                  type="button"
                  onClick={exportList}
                  title="Export your list as JSON"
                  aria-label="Export your list"
                  className="grid size-7 place-items-center rounded-md text-ink-dim transition-colors duration-150 hover:bg-white/[0.07] hover:text-primary"
                >
                  <Download className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  title="Import a Reelivo watchlist file"
                  aria-label="Import a watchlist file"
                  className="grid size-7 place-items-center rounded-md text-ink-dim transition-colors duration-150 hover:bg-white/[0.07] hover:text-primary"
                >
                  <Upload className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  title="Clear your entire list"
                  aria-label="Clear your list"
                  className="grid size-7 place-items-center rounded-md text-ink-dim transition-colors duration-150 hover:bg-destructive/15 hover:text-destructive"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                aria-hidden
                tabIndex={-1}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onImportFile(f);
                  e.target.value = ""; // allow re-importing the same file
                }}
              />
            </div>
          </div>

          {/* folder chips — file titles into named lists */}
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Your lists">
            <Chip selected={folderFilter === "all"} onClick={() => setFolderFilter("all")}>
              All lists <span className="tabular opacity-60">{watchlist.length}</span>
            </Chip>
            <Chip selected={folderFilter === ""} onClick={() => setFolderFilter("")}>
              My list <span className="tabular opacity-60">{myListCount}</span>
            </Chip>
            {folders.map((f) => (
              <Chip key={f} selected={folderFilter === f} onClick={() => setFolderFilter(f)}>
                <span className="inline-flex items-center gap-1.5">
                  <Folder className="size-3" aria-hidden />
                  {f} <span className="tabular opacity-60">{folderCounts.get(f) ?? 0}</span>
                </span>
              </Chip>
            ))}
            {folderFilter !== "all" && folderFilter !== "" && (
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => openRename(folderFilter)}
                  aria-label={`Rename list ${folderFilter}`}
                  className="grid size-8 place-items-center rounded-full border border-white/10 text-ink-dim transition-colors duration-150 hover:border-primary/60 hover:text-primary"
                >
                  <Pencil className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setDissolve(folderFilter)}
                  aria-label={`Dissolve list ${folderFilter}`}
                  className="grid size-8 place-items-center rounded-full border border-white/10 text-ink-dim transition-colors duration-150 hover:border-destructive hover:text-destructive"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </span>
            )}
          </div>
          {folders.length === 0 && (
            <p className="text-[11.5px] text-ink-dim/80">
              Tip — use the{" "}
              <FolderInput className="inline size-3 -translate-y-px" aria-hidden /> icon on a title to
              file it into a named list.
            </p>
          )}
        </div>
      )}

      {!mounted ? null : watchlist.length === 0 ? (
        <div className="mt-8">
          <EmptyNote title="Nothing saved yet.">
            Tap the bookmark on any title to keep it here. Your list lives in this browser —
            no account, no noise.
          </EmptyNote>
          <div className="mt-6 text-center">
            <a
              href="#/"
              className="inline-flex h-11 items-center rounded-lg bg-white px-6 text-sm font-bold text-black transition-colors hover:bg-white/85"
            >
              Browse tonight's picks
            </a>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-8">
          <EmptyNote title="Nothing here in this corner.">
            {folderFilter !== "all" && folderFilter !== ""
              ? `“${folderFilter}” doesn't hold any${filter === "movie" ? " films" : filter === "tv" ? " series" : ""} yet — file titles with the folder icon on each row.`
              : folderFilter === ""
                ? "Every saved title lives in a named list. File something back to My list any time."
                : filter === "movie"
                  ? "No films on your list yet — tap Films in the top bar and save a few."
                  : "No series on your list yet — tap Series in the top bar and save a few."}
          </EmptyNote>
        </div>
      ) : (
        <ol className="mt-4 rounded-xl border border-white/[0.06] bg-surface px-4 py-1 md:px-6">
          {filtered.map((item) => (
            <ListRow
              key={`${item.type}-${item.id}`}
              item={item}
              folders={folders}
              onNewList={openCreate}
            />
          ))}
        </ol>
      )}

      {/* backdrop strip keeps the page cinematic when a list has art */}
      {mounted && watchlist.length > 3 && (
        <div className="no-scrollbar mt-10 flex gap-3 overflow-x-auto" aria-hidden>
          {watchlist.slice(0, 8).map((w) => (
            <Img
              key={`${w.type}-${w.id}-strip`}
              src={still(w.backdrop, "w300")}
              alt=""
              fallbackTitle={w.title}
              className="h-16 w-28 shrink-0 rounded-lg object-cover opacity-50"
            />
          ))}
        </div>
      )}

      {/* create / rename a list */}
      <Dialog
        open={dialog !== null}
        onOpenChange={(v) => {
          if (!v) {
            setDialog(null);
            setPendingMove(null);
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          className="max-w-sm gap-4 rounded-2xl border-white/10 bg-popover p-6"
        >
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="text-foreground">
              {dialog?.mode === "rename" ? "Rename list" : "New list"}
            </DialogTitle>
            <DialogDescription className="text-ink-dim">
              {dialog?.mode === "rename"
                ? "Every title filed here follows the new name."
                : pendingMove
                  ? `Filing “${pendingMove.title}” — name the list.`
                  : "Group titles however you like — weekends, horror night, with the kids."}
            </DialogDescription>
          </DialogHeader>
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitDialog();
            }}
            maxLength={40}
            placeholder="List name"
            aria-label="List name"
            className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-ink-dim/60 focus-visible:border-primary"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDialog(null);
                setPendingMove(null);
              }}
              className="rounded-lg px-3.5 py-2 text-[13px] font-semibold text-ink-dim transition-colors hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitDialog}
              disabled={nameDraft.trim().length === 0}
              className="rounded-lg bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground transition-all duration-150 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {dialog?.mode === "rename" ? "Rename" : pendingMove ? "File title" : "Create list"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* dissolve a folder (titles fall back to My list) */}
      <AlertDialog open={dissolve !== null} onOpenChange={(v) => !v && setDissolve(null)}>
        <AlertDialogContent className="border-white/10 bg-popover">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              Dissolve “{dissolve}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The {folderCounts.get(dissolve ?? "") ?? 0}{" "}
              {(folderCounts.get(dissolve ?? "") ?? 0) === 1 ? "title" : "titles"} filed here{" "}
              {(folderCounts.get(dissolve ?? "") ?? 0) === 1 ? "falls" : "fall"} back to My list —
              nothing is deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-transparent text-foreground hover:bg-white/10 hover:text-foreground">
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDissolve}
              className="bg-destructive text-white hover:bg-destructive/85"
            >
              Dissolve list
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent className="border-white/10 bg-popover">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Clear your whole list?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes all {watchlist.length} saved {watchlist.length === 1 ? "title" : "titles"} from
              this browser. Consider exporting first — it can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-transparent text-foreground hover:bg-white/10 hover:text-foreground">
              Keep my list
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearWatchlist();
                setFilter("all");
                setFolderFilter("all");
                toast.success("List cleared");
              }}
              className="bg-destructive text-white hover:bg-destructive/85"
            >
              Clear everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
