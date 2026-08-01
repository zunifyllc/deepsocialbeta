import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { PostCard } from "@/components/posts/post-card";
import { getFeed, deletePost } from "@/lib/posts.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/explore")({
  head: () => ({
    meta: [
      { title: "Explore / DeepSocial" },
      { name: "description", content: "Discover public posts on DeepSocial." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(exploreQueryOptions()),
  component: ExplorePage,
});

const exploreQueryOptions = () => ({
  queryKey: ["explore"],
  queryFn: () => getFeed({ data: { type: "global" } }),
});

function ExplorePage() {
  const queryClient = useQueryClient();
  const { data: posts } = useSuspenseQuery(exploreQueryOptions());
  const remove = useServerFn(deletePost);

  const handleDelete = async (id: string) => {
    await remove({ data: { id } });
    queryClient.invalidateQueries({ queryKey: ["explore"] });
  };

  return (
    <AppShell>
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md">
        <h1 className="text-xl font-bold">Explore</h1>
      </div>

      <div>
        {posts?.map((post) => (
          <PostCard key={post.id} post={post} onDelete={handleDelete} />
        ))}
        {posts?.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            <p>No posts yet.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
