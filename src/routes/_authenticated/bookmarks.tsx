import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bookmark, FolderPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { PostCard } from "@/components/posts/post-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  createCollection,
  deleteCollection,
  getBookmarkedPosts,
  getMyCollections,
} from "@/lib/bookmarks.functions";
import { deletePost } from "@/lib/posts.functions";

type Selection = { scope: "all" } | { scope: "unsorted" } | { scope: "collection"; id: string; name: string };

export const Route = createFileRoute("/_authenticated/bookmarks")({
  head: () => ({
    meta: [
      { title: "Bookmarks / DeepSocial" },
      { name: "description", content: "Posts you have privately saved on DeepSocial, organized in collections." },
      { property: "og:title", content: "Bookmarks / DeepSocial" },
      { property: "og:description", content: "Posts you have privately saved on DeepSocial, organized in collections." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BookmarksPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div role="alert" className="p-8 text-center text-muted-foreground">
        {(error as Error).message}
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <div className="p-8 text-center text-muted-foreground">No bookmarks found.</div>
    </AppShell>
  ),
});

function BookmarksPage() {
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<Selection>({ scope: "all" });
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const create = useServerFn(createCollection);
  const removeCollection = useServerFn(deleteCollection);
  const remove = useServerFn(deletePost);

  const collections = useQuery({
    queryKey: ["bookmark-collections"],
    queryFn: () => getMyCollections(),
  });

  const bookmarkParams =
    selection.scope === "collection"
      ? { scope: "collection" as const, collectionId: selection.id }
      : { scope: selection.scope };

  const posts = useQuery({
    queryKey: ["bookmarks", bookmarkParams],
    queryFn: () => getBookmarkedPosts({ data: bookmarkParams }),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    queryClient.invalidateQueries({ queryKey: ["bookmark-collections"] });
  };

  const handleDelete = async (id: string) => {
    await remove({ data: { id } });
    refresh();
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await create({ data: { name } });
      setNewName("");
      setCreating(false);
      refresh();
      toast.success(`Created "${name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create collection");
    }
  };

  const handleDeleteCollection = async () => {
    if (selection.scope !== "collection") return;
    try {
      await removeCollection({ data: { collectionId: selection.id } });
      setSelection({ scope: "all" });
      refresh();
      toast.success("Collection deleted. Its bookmarks are now unsorted.");
    } catch {
      toast.error("Could not delete collection");
    } finally {
      setConfirmDelete(false);
    }
  };

  const heading =
    selection.scope === "collection" ? selection.name : selection.scope === "unsorted" ? "Unsorted" : "All bookmarks";

  const isActive = (candidate: Selection) =>
    candidate.scope === selection.scope &&
    (candidate.scope !== "collection" || (selection.scope === "collection" && candidate.id === selection.id));

  return (
    <AppShell hideRightSidebar>
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md">
        <h1 className="text-xl font-bold">Bookmarks</h1>
        <p className="text-sm text-muted-foreground">Only you can see what you've saved.</p>
      </div>

      <div className="flex flex-col md:flex-row">
        <aside className="border-b border-border p-3 md:w-56 md:flex-shrink-0 md:border-b-0 md:border-r">
          <nav className="space-y-1">
            <CollectionRow
              label="All bookmarks"
              count={collections.data?.totalCount ?? 0}
              active={isActive({ scope: "all" })}
              onClick={() => setSelection({ scope: "all" })}
            />
            <CollectionRow
              label="Unsorted"
              count={collections.data?.unsortedCount ?? 0}
              active={isActive({ scope: "unsorted" })}
              onClick={() => setSelection({ scope: "unsorted" })}
            />
            {collections.data?.collections.map((collection) => (
              <CollectionRow
                key={collection.id}
                label={collection.name}
                count={collection.bookmarkCount}
                active={isActive({ scope: "collection", id: collection.id, name: collection.name })}
                onClick={() => setSelection({ scope: "collection", id: collection.id, name: collection.name })}
              />
            ))}
          </nav>

          {creating ? (
            <div className="mt-3 space-y-2">
              <Input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") setCreating(false);
                }}
                maxLength={50}
                placeholder="Collection name"
                className="rounded-md border-border bg-background"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleCreate} disabled={!newName.trim()} className="rounded-full font-bold">
                  Create
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCreating(false)} className="rounded-full">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => setCreating(true)}
              className="mt-3 w-full rounded-full border-border bg-transparent font-bold"
            >
              <FolderPlus className="mr-2 h-4 w-4" /> Add collection
            </Button>
          )}
        </aside>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Bookmark className="h-4 w-4" />
              {heading}
            </h2>
            {selection.scope === "collection" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                className="rounded-full text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="mr-1 h-4 w-4" /> Delete
              </Button>
            )}
          </div>

          {posts.data?.map((post) => (
            <PostCard
              key={post.feedKey ?? post.id}
              post={post}
              onDelete={handleDelete}
              onRepostChange={refresh}
              onBookmarkChange={refresh}
            />
          ))}

          {posts.data?.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              <p className="text-xl font-bold">Nothing saved here yet</p>
              <p className="mt-2">Tap the bookmark icon on any post, then use "Save to collection..." to file it.</p>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this collection?</AlertDialogTitle>
            <AlertDialogDescription>
              The posts inside stay bookmarked and move back to Unsorted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCollection} className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function CollectionRow({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
        active ? "bg-accent font-bold" : "text-muted-foreground"
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="text-xs text-muted-foreground">{count}</span>
    </button>
  );
}
