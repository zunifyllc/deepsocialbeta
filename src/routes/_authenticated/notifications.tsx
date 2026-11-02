import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Heart, MessageCircle, UserPlus, Repeat2, BarChart2, Settings } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { FollowButton } from "@/components/profile/follow-button";
import {
  getGroupedNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/notifications.functions";
import { groupSummary, type GroupedNotification } from "@/lib/notification-helpers";

type Filter = "all" | "like" | "reply" | "follow" | "repost";

const TABS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "like", label: "Likes" },
  { value: "reply", label: "Replies" },
  { value: "follow", label: "Follows" },
  { value: "repost", label: "Reposts" },
];

export const Route = createFileRoute("/_authenticated/notifications")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Notifications / DeepSocial" },
      { name: "description", content: "See who liked, replied, reposted, and followed you on DeepSocial." },
      { property: "og:title", content: "Notifications / DeepSocial" },
      { property: "og:description", content: "See who liked, replied, reposted, and followed you on DeepSocial." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationsPage,
});

function TypeIcon({ type }: { type: GroupedNotification["type"] }) {
  if (type === "like") return <Heart className="h-6 w-6 fill-primary text-primary" />;
  if (type === "reply") return <MessageCircle className="h-6 w-6 text-primary" />;
  if (type === "follow") return <UserPlus className="h-6 w-6 text-green-500" />;
  if (type === "repost") return <Repeat2 className="h-6 w-6 text-green-500" />;
  return <BarChart2 className="h-6 w-6 text-primary" />;
}

function ActorAvatars({ group }: { group: GroupedNotification }) {
  return (
    <div className="flex items-center gap-1">
      {group.actors.slice(0, 5).map((actor) => (
        <div key={actor.id} className="h-8 w-8 overflow-hidden rounded-full bg-muted">
          {actor.avatar_url ? (
            <img src={actor.avatar_url} alt={actor.display_name ?? actor.username} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-bold text-muted-foreground">
              {(actor.display_name ?? actor.username).charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function NotificationsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const markRead = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["notifications", "grouped", filter],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getGroupedNotifications({ data: { page: pageParam as number, typeFilter: filter } }),
    getNextPageParam: (lastPage, allPages) => (lastPage.hasMore ? allPages.length : undefined),
  });

  const groups = data?.pages.flatMap((p) => p.items) ?? [];
  const followingIds = new Set(data?.pages.flatMap((p) => p.followingIds) ?? []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleGroupClick = useCallback(
    async (group: GroupedNotification) => {
      if (group.unread) {
        await markRead({ data: { notificationIds: group.ids } });
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      }
    },
    [markRead, queryClient],
  );

  const handleMarkAll = async () => {
    await markAll({});
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <AppShell>
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold">Notifications</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleMarkAll} className="rounded-full text-sm font-bold">
              Mark all as read
            </Button>
            <Link
              to="/settings/notifications"
              className="rounded-full p-2 transition-colors hover:bg-accent"
              aria-label="Notification settings"
            >
              <Settings className="h-5 w-5" />
            </Link>
          </div>
        </div>
        <div className="flex">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`flex-1 border-b-2 px-2 py-3 text-sm transition-colors hover:bg-muted/20 ${
                filter === tab.value ? "border-primary font-bold" : "border-transparent font-medium text-muted-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        {groups.map((group) => {
          const { names, verb } = groupSummary(group);
          const body = (
            <div className="flex-1">
              <ActorAvatars group={group} />
              <p className="mt-2 text-[15px]">
                <span className="font-bold">{names}</span> {verb}
              </p>
              {group.post && (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{group.post.content}</p>
              )}
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(group.created_at), { addSuffix: true })}
              </p>
            </div>
          );

          return (
            <div
              key={group.key}
              onClick={() => handleGroupClick(group)}
              className={`flex gap-3 border-b border-border px-4 py-4 transition-colors hover:bg-muted/20 ${
                group.unread ? "bg-muted/10" : ""
              }`}
            >
              <div className="flex-shrink-0 pt-1">
                <TypeIcon type={group.type} />
              </div>
              {group.post_id ? (
                <Link to="/post/$postId" params={{ postId: group.post_id }} className="flex-1">
                  {body}
                </Link>
              ) : (
                body
              )}
              {group.type === "follow" && group.actors.length === 1 && group.actors[0] && !followingIds.has(group.actors[0].id) && (
                <div className="flex items-start pt-1">
                  <FollowButton userId={group.actors[0].id} />
                </div>
              )}
            </div>
          );
        })}

        {!isLoading && groups.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            <p className="text-xl font-bold">Nothing to see here</p>
            <p className="mt-2">Notifications will appear when someone interacts with you.</p>
          </div>
        )}

        <div ref={sentinelRef} className="h-10" />
        {isFetchingNextPage && <p className="p-4 text-center text-sm text-muted-foreground">Loading more…</p>}
      </div>
    </AppShell>
  );
}
