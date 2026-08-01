import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { getNotifications, markNotificationRead, type Notification } from "@/lib/notifications.functions";
import { useServerFn } from "@tanstack/react-start";
import { Heart, MessageCircle, UserPlus, Repeat2, BarChart2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface NotificationWithActor extends Notification {}

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications / DeepSocial" },
      { name: "description", content: "Your notifications on DeepSocial." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(notificationsQueryOptions()),
  component: NotificationsPage,
});

const notificationsQueryOptions = () => ({
  queryKey: ["notifications"],
  queryFn: () => getNotifications(),
});

function NotificationsPage() {
  const queryClient = useQueryClient();
  const { data: notifications } = useSuspenseQuery(notificationsQueryOptions());
  const markRead = useServerFn(markNotificationRead);

  const handleMarkRead = async (id: string) => {
    await markRead({ data: { id } });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <AppShell>
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md">
        <h1 className="text-xl font-bold">Notifications</h1>
      </div>

      <div>
        {notifications?.map((n) => (
          <div
            key={n.id}
            onClick={() => handleMarkRead(n.id)}
            className={`flex cursor-pointer gap-3 border-b border-border px-4 py-4 transition-colors hover:bg-muted/20 ${
              !n.read_at ? "bg-muted/10" : ""
            }`}
          >
            <div className="flex-shrink-0 pt-1">
              {n.type === "like" && <Heart className="h-6 w-6 fill-pink-500 text-pink-500" />}
              {n.type === "reply" && <MessageCircle className="h-6 w-6 text-primary" />}
              {n.type === "follow" && <UserPlus className="h-6 w-6 text-green-500" />}
              {n.type === "repost" && <Repeat2 className="h-6 w-6 text-green-500" />}
              {n.type === "poll_vote" && <BarChart2 className="h-6 w-6 text-primary" />}
            </div>
            <div className="flex-1">
              <div className="h-8 w-8 overflow-hidden rounded-full bg-muted">
                {n.actor?.avatar_url ? (
                  <img src={n.actor.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs font-bold text-muted-foreground">
                    {(n.actor?.display_name ?? n.actor?.username ?? "?").charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <p className="mt-2 text-[15px]">
                <span className="font-bold">{n.actor?.display_name ?? n.actor?.username}</span>{" "}
                {n.type === "like" && "liked your post"}
                {n.type === "reply" && "replied to your post"}
                {n.type === "follow" && "followed you"}
                {n.type === "repost" && "reposted your post"}
                {n.type === "poll_vote" && "voted in your poll"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
              </p>
            </div>
          </div>
        ))}
        {notifications?.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            <p className="text-xl font-bold">Nothing to see here</p>
            <p className="mt-2">Notifications will appear when someone interacts with you.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
