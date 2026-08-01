import { useState } from "react";
import { Check, FolderPlus, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createCollection,
  getBookmarkStatus,
  getMyCollections,
  moveBookmark,
  toggleBookmark,
} from "@/lib/bookmarks.functions";

interface SaveToCollectionDialogProps {
  postId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function SaveToCollectionDialog({ postId, open, onOpenChange, onSaved }: SaveToCollectionDialogProps) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const move = useServerFn(moveBookmark);
  const create = useServerFn(createCollection);
  const bookmark = useServerFn(toggleBookmark);

  const status = useQuery({
    queryKey: ["bookmark-status", postId],
    queryFn: () => getBookmarkStatus({ data: { postId } }),
    enabled: open,
  });

  const collections = useQuery({
    queryKey: ["bookmark-collections"],
    queryFn: () => getMyCollections(),
    enabled: open,
  });

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["bookmark-collections"] }),
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] }),
      queryClient.invalidateQueries({ queryKey: ["bookmark-status", postId] }),
    ]);
    onSaved?.();
  };

  /** Ensures the post is bookmarked and returns the bookmark row id. */
  const ensureBookmark = async () => {
    if (status.data?.bookmarkId) return status.data.bookmarkId;
    await bookmark({ data: { postId } });
    const fresh = await getBookmarkStatus({ data: { postId } });
    return fresh.bookmarkId;
  };

  const handleSelect = async (collectionId: string | null) => {
    setBusy(true);
    try {
      const bookmarkId = await ensureBookmark();
      if (!bookmarkId) throw new Error("Could not save this post");
      await move({ data: { bookmarkId, collectionId } });
      await refreshAll();
      toast.success(collectionId ? "Saved to collection" : "Moved to unsorted");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update collection");
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const collection = await create({ data: { name } });
      setNewName("");
      const bookmarkId = await ensureBookmark();
      if (bookmarkId) await move({ data: { bookmarkId, collectionId: collection.id } });
      await refreshAll();
      toast.success(`Saved to ${collection.name}`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create collection");
    } finally {
      setBusy(false);
    }
  };

  const currentId = status.data?.collectionId ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save to collection</DialogTitle>
          <DialogDescription>Collections are private to you.</DialogDescription>
        </DialogHeader>

        <div className="max-h-72 space-y-1 overflow-y-auto">
          <button
            onClick={() => handleSelect(null)}
            disabled={busy}
            className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
          >
            <span>Unsorted</span>
            {currentId === null && <Check className="h-4 w-4 text-primary" />}
          </button>

          {collections.data?.collections.map((collection) => (
            <button
              key={collection.id}
              onClick={() => handleSelect(collection.id)}
              disabled={busy}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
            >
              <span className="truncate">{collection.name}</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {collection.bookmarkCount}
                {currentId === collection.id && <Check className="h-4 w-4 text-primary" />}
              </span>
            </button>
          ))}

          {collections.isLoading && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-border pt-3">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
            maxLength={50}
            placeholder="New collection name"
            className="rounded-md border-border bg-background"
          />
          <Button onClick={handleCreate} disabled={busy || !newName.trim()} className="rounded-full font-bold">
            <FolderPlus className="mr-1 h-4 w-4" /> Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
