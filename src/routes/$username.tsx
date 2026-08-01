import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { ProfileHeader } from "@/components/profile/profile-header";
import { PostCard } from "@/components/posts/post-card";
import { getProfileByUsername } from "@/lib/profiles.functions";
import { getUserPosts, deletePost } from "@/lib/posts.functions";
import { getFollowCounts } from "@/lib/follows.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/$username")({
  head: () => ({
    meta: [
      { title: "Profile / DeepSocial" },
      { name: "description", content: "View profile on DeepSocial." },
      { property: "og:title", content: "Profile / DeepSocial" },
      { property: "og:description", content: "View profile on DeepSocial." },
    ],
  }),
  loader: async ({ params, context }) => {
    const profile = await getProfileByUsername({ data: { username: params.username } });
    if (!profile) throw notFound();
    await context.queryClient.ensureQueryData(userPostsQueryOptions(profile.id));
    await context.queryClient.ensureQueryData(followCountsQueryOptions(profile.id));
    return { profile };
  },
  component: ProfilePage,
});

const userPostsQueryOptions = (userId: string) => ({
  queryKey: ["user-posts", userId],
  queryFn: () => getUserPosts({ data: { userId } }),
});

const followCountsQueryOptions = (userId: string) => ({
  queryKey: ["follow-counts", userId],
  queryFn: () => getFollowCounts({ data: { userId } }),
});

function ProfilePage() {
  const { profile } = Route.useLoaderData();
  const [activeTab, setActiveTab] = useState<"posts" | "replies" | "media" | "likes">("posts");
  const queryClient = useQueryClient();
  const { data: posts } = useSuspenseQuery(userPostsQueryOptions(profile.id));
  const { data: counts } = useSuspenseQuery(followCountsQueryOptions(profile.id));
  const remove = useServerFn(deletePost);

  const handleDelete = async (id: string) => {
    await remove({ data: { id } });
    queryClient.invalidateQueries({ queryKey: ["user-posts", profile.id] });
  };

  const filteredPosts =
    activeTab === "media"
      ? posts?.filter((p) => p.media_urls && p.media_urls.length > 0)
      : activeTab === "likes"
      ? []
      : posts;

  return (
    <AppShell>
      <ProfileHeader
        profile={profile}
        followingCount={counts?.following ?? 0}
        followersCount={counts?.followers ?? 0}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <div>
        {activeTab === "likes" ? (
          <div className="p-8 text-center text-muted-foreground">
            <p className="text-xl font-bold">No liked posts yet</p>
          </div>
        ) : (
          filteredPosts?.map((post) => <PostCard key={post.id} post={post} onDelete={handleDelete} />)
        )}
        {filteredPosts?.length === 0 && activeTab !== "likes" && (
          <div className="p-8 text-center text-muted-foreground">
            <p className="text-xl font-bold">No posts yet</p>
            <p className="mt-2">When @{profile.username} posts, they'll show up here.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
