import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSuspenseQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { ProfileHeader } from "@/components/profile/profile-header";
import { PostCard } from "@/components/posts/post-card";
import { getProfileByUsername, getPinnedPost } from "@/lib/profiles.functions";
import { getUserPosts, getUserLikedPosts, deletePost } from "@/lib/posts.functions";
import { getFollowCounts } from "@/lib/follows.functions";
import { getUserReposts } from "@/lib/reposts.functions";
import type { ProfileTab } from "@/components/profile/profile-header";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { recordProfileVisit } from "@/lib/analytics.functions";

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

const userRepostsQueryOptions = (userId: string) => ({
  queryKey: ["user-reposts", userId],
  queryFn: () => getUserReposts({ data: { userId } }),
});

const pinnedPostQueryOptions = (userId: string) => ({
  queryKey: ["pinned-post", userId],
  queryFn: () => getPinnedPost({ data: { userId } }),
});

const likedPostsQueryOptions = (userId: string, enabled: boolean) => ({
  queryKey: ["user-likes", userId],
  queryFn: () => getUserLikedPosts({ data: { userId } }),
  enabled,
});

const followCountsQueryOptions = (userId: string) => ({
  queryKey: ["follow-counts", userId],
  queryFn: () => getFollowCounts({ data: { userId } }),
});

function ProfilePage() {
  const { profile } = Route.useLoaderData();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
  const queryClient = useQueryClient();
  const { data: posts } = useSuspenseQuery(userPostsQueryOptions(profile.id));
  const { data: counts } = useSuspenseQuery(followCountsQueryOptions(profile.id));
  const { data: reposts } = useQuery(userRepostsQueryOptions(profile.id));
  const { data: pinnedPost } = useQuery(pinnedPostQueryOptions(profile.id));
  const isOwnProfile = user?.id === profile.id;
  const { data: likedPosts } = useQuery(likedPostsQueryOptions(profile.id, activeTab === "likes" && isOwnProfile));
  const remove = useServerFn(deletePost);
  const recordVisit = useServerFn(recordProfileVisit);

  useEffect(() => {
    if (!user || isOwnProfile) return;
    recordVisit({ data: { profileId: profile.id } }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profile.id, isOwnProfile]);

  const handleDelete = async (id: string) => {
    await remove({ data: { id } });
    queryClient.invalidateQueries({ queryKey: ["user-posts", profile.id] });
    queryClient.invalidateQueries({ queryKey: ["user-reposts", profile.id] });
    queryClient.invalidateQueries({ queryKey: ["pinned-post", profile.id] });
  };

  const invalidatePinned = () => {
    queryClient.invalidateQueries({ queryKey: ["pinned-post", profile.id] });
  };

  const invalidateFeeds = () => {
    queryClient.invalidateQueries({ queryKey: ["user-posts", profile.id] });
    queryClient.invalidateQueries({ queryKey: ["user-reposts", profile.id] });
  };

  const filteredPosts =
    activeTab === "reposts"
      ? reposts ?? []
      : activeTab === "media"
      ? posts?.filter((p) => p.media_urls && p.media_urls.length > 0)
      : activeTab === "likes"
      ? likedPosts ?? []
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
        {activeTab === "posts" && pinnedPost && (
          <PostCard
            key={`pinned-${pinnedPost.id}`}
            post={pinnedPost}
            pinned
            onPinChange={invalidatePinned}
            onDelete={handleDelete}
            onRepostChange={invalidateFeeds}
          />
        )}
        {activeTab === "likes" && !isOwnProfile ? (
          <div className="p-8 text-center text-muted-foreground">
            <p className="text-xl font-bold">Likes are private</p>
            <p className="mt-2">Only {profile.username} can see the posts they liked.</p>
          </div>
        ) : (
          filteredPosts?.map((post) => (
            <PostCard
              key={post.feedKey ?? post.id}
              post={post}
              onDelete={handleDelete}
              onPinChange={invalidatePinned}
              onRepostChange={invalidateFeeds}
            />
          ))
        )}
        {filteredPosts?.length === 0 && (activeTab !== "likes" || isOwnProfile) && (
          <div className="p-8 text-center text-muted-foreground">
            <p className="text-xl font-bold">No posts yet</p>
            <p className="mt-2">
              {activeTab === "reposts"
                ? `When @${profile.username} reposts, they'll show up here.`
                : `When @${profile.username} posts, they'll show up here.`}
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
