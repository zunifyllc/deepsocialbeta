import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/layout/app-shell";
import { PostCard } from "@/components/posts/post-card";
import { getBookmarkedPosts } from "@/lib/bookmarks.functions";
import { deletePost } from "@/lib/posts.functions";

const bookmarksQueryOptions = () => ({
  queryKey: ["bookmarks"],
  queryFn: () => getBookmarkedPosts({ data: {} }),
});

export const Route = createFileRoute("/_authenticated/bookmarks")({
  head: () => ({
    meta: [
      { title: "Bookmarks / DeepSocial" },
      { name: "description", content: "Posts you have privately saved on DeepSocial." },
      { property: "og:title", content: "Bookmarks / DeepSocial" },
      { property: "og:description", content: "Posts you have privately saved on DeepSocial." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BookmarksPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div role="alert" className="p-8 text-center text-muted-foreground">
        {error.message}
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
  const { data: posts } = useSuspenseQuery(bookmarksQueryOptions());
  const remove = useServerFn(deletePost);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["bookmarks"] });

  const handleDelete = async (id: string) => {
    await remove({ data: { id } });
    refresh();
  };

  return (
    <AppShell>
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md">
        <h1 className="text-xl font-bold">Bookmarks</h1>
        <p className="text-sm text-muted-foreground">Only you can see what you've saved.</p>
      </div>

      <div>
        {posts?.map((post) => (
          <PostCard
            key={post.feedKey ?? post.id}
            post={post}
            onDelete={handleDelete}
            onRepostChange={refresh}
            onBookmarkChange={refresh}
          />
        ))}
        {posts?.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            <p className="text-xl font-bold">Save posts for later</p>
            <p className="mt-2">Tap the bookmark icon on any post to save it here privately.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
