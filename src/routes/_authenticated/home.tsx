import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { PostComposer } from "@/components/posts/post-composer";
import { PostCard } from "@/components/posts/post-card";
import { getFeed, deletePost } from "@/lib/posts.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Home / X Clone" },
      { name: "description", content: "Your personalized timeline on X Clone." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(feedQueryOptions()),
  component: HomePage,
});

const feedQueryOptions = () => ({
  queryKey: ["feed"],
  queryFn: () => getFeed({ data: { type: "following" } }),
});

function HomePage() {
  const [activeTab, setActiveTab] = useState<"for-you" | "following">("following");
  const queryClient = useQueryClient();
  const { data: posts } = useSuspenseQuery(feedQueryOptions());
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

      <PostComposer onSuccess={() => queryClient.invalidateQueries({ queryKey: ["feed"] })} />

      <div>
        {posts?.map((post) => (
          <PostCard key={post.id} post={post} onDelete={handleDelete} />
        ))}
        {posts?.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            <p className="text-xl font-bold">Welcome to your timeline</p>
            <p className="mt-2">Follow people to see their posts here.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
