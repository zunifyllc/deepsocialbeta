import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { AppShell } from "@/components/layout/app-shell";
import { PostCard } from "@/components/posts/post-card";
import { getFeed, deletePost } from "@/lib/posts.functions";
import { getHashtagPosts } from "@/lib/trending.functions";
import { useServerFn } from "@tanstack/react-start";

const searchSchema = z.object({
  hashtag: fallback(z.string(), "").default(""),
});

const exploreQueryOptions = (hashtag: string) => ({
  queryKey: ["explore", hashtag],
  queryFn: () =>
    hashtag
      ? getHashtagPosts({ data: { hashtag } })
      : getFeed({ data: { type: "global" } }),
});

export const Route = createFileRoute("/explore")({
  staticData: { sitemap: true },
  validateSearch: zodValidator(searchSchema),
  loaderDeps: ({ search }) => ({ hashtag: search.hashtag }),
  head: () => ({
    links: [{ rel: "canonical", href: "https://deepsocial.zunify.site/explore" }],
    meta: [
      { property: "og:url", content: "https://deepsocial.zunify.site/explore" },
      { title: "Explore / DeepSocial" },
      { name: "description", content: "Discover public posts and trending hashtags on DeepSocial." },
      { property: "og:title", content: "Explore / DeepSocial" },
      { property: "og:description", content: "Discover public posts and trending hashtags on DeepSocial." },
    ],
  }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(exploreQueryOptions(deps.hashtag)),
  component: ExplorePage,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-8 text-center text-muted-foreground">
      {(error as Error).message}
    </div>
  ),
  notFoundComponent: () => <div className="p-8 text-center text-muted-foreground">Nothing here.</div>,
});

function ExplorePage() {
  const queryClient = useQueryClient();
  const { hashtag } = Route.useSearch();
  const tag = hashtag.trim().replace(/^#/, "").slice(0, 60);
  const { data: posts } = useSuspenseQuery(exploreQueryOptions(tag));
  const remove = useServerFn(deletePost);

  const handleDelete = async (id: string) => {
    await remove({ data: { id } });
    queryClient.invalidateQueries({ queryKey: ["explore"] });
  };

  return (
    <AppShell>
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md">
        <h1 className="text-xl font-bold">{tag ? `Posts with #${tag}` : "Explore"}</h1>
      </div>

      <div>
        {posts?.map((post) => (
          <PostCard key={post.feedKey ?? post.id} post={post} onDelete={handleDelete} />
        ))}
        {posts?.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            <p>{tag ? `No posts with #${tag} yet.` : "No posts yet."}</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
