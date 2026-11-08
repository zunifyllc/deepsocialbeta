import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { PostComposer } from "@/components/posts/post-composer";
import { PostCard } from "@/components/posts/post-card";
import { getFeed, deletePost } from "@/lib/posts.functions";
import { useServerFn } from "@tanstack/react-start";

type FeedTab = "for-you" | "following";

export const Route = createFileRoute("/_authenticated/home")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Home / DeepSocial" },
      { name: "description", content: "Your personalized timeline on DeepSocial." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(feedQueryOptions("following")),
  component: HomePage,
});

const feedQueryOptions = (type: FeedTab) => ({
  queryKey: ["feed", type],
  queryFn: () => getFeed({ data: { type } }),
});

function HomePage() {
  const [activeTab, setActiveTab] = useState<FeedTab>("following");
  const queryClient = useQueryClient();
  const { data: posts } = useSuspenseQuery(feedQueryOptions(activeTab));
  const remove = useServerFn(deletePost);

  const handleDelete = async (id: string) => {
    await remove({ data: { id } });
    queryClient.invalidateQueries({ queryKey: ["feed"] });
  };

  return (
    <AppShell>
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md">
        <h1 className="px-4 py-3 text-xl font-bold">Home</h1>
        <div className="flex">
          {(["for-you", "following"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative flex-1 py-4 text-sm font-medium capitalize transition-colors hover:bg-accent/50 ${
                activeTab === tab ? "font-bold text-foreground" : "text-muted-foreground"
              }`}
            >
              {tab.replace("-", " ")}
              {activeTab === tab && <div className="absolute bottom-0 left-1/2 h-1 w-16 -translate-x-1/2 rounded-full bg-primary" />}
            </button>
          ))}
        </div>
      </div>

      <div id="compose" className="scroll-mt-20">
        <PostComposer onSuccess={() => queryClient.invalidateQueries({ queryKey: ["feed"] })} />
      </div>

      <div>
        {posts?.map((post) => (
          <PostCard
            key={post.feedKey ?? post.id}
            post={post}
            onDelete={handleDelete}
            onRepostChange={() => queryClient.invalidateQueries({ queryKey: ["feed"] })}
          />
        ))}
        {posts?.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            <p className="text-xl font-bold">Welcome to your timeline</p>
            <p className="mt-2">{activeTab === "following" ? "Follow people to see their posts here." : "No public posts yet. Be the first to post!"}</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
