import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-middleware";
import { groupNotifications, type GroupedNotification, type RawNotification } from "./notification-helpers";

export type { GroupedNotification, RawNotification } from "./notification-helpers";

export interface NotificationActor {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface NotificationPost {
  id: string;
  content: string;
}

export interface Notification {
  id: string;
  type: "like" | "reply" | "follow" | "repost" | "poll_vote";
  read_at: string | null;
  created_at: string;
  post_id: string | null;
  actor: NotificationActor | null;
  post: NotificationPost | null;
}

export interface NotificationSettings {
  user_id: string;
  email_likes: boolean;
  email_replies: boolean;
  email_follows: boolean;
  email_reposts: boolean;
}

const SELECT = `
  id,
  type,
  read_at,
  created_at,
  post_id,
  actor:profiles!notifications_actor_id_profiles_fkey(id, username, display_name, avatar_url),
  post:posts!notifications_post_id_fkey(id, content)
`;

export const getNotifications = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { getHiddenAuthorIds } = await import("./privacy-helpers.server");
    const { listNotifications } = await import("./neon/features.server");
    const hidden = await getHiddenAuthorIds(context.userId);
    const notifications = await listNotifications(context.userId, hidden, { limit: 50 });
    return (notifications ?? []) as unknown as Notification[];
  });

const PAGE_ROWS = 40;

export const getGroupedNotifications = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({
        page: z.number().int().min(0).default(0),
        typeFilter: z.enum(["all", "like", "reply", "follow", "repost", "poll_vote"]).default("all"),
      })
      .parse(input ?? {}),
  )
  .middleware([requireAuth])
  .handler(async ({ data, context }) => {
    const from = data.page * PAGE_ROWS;
    const { getHiddenAuthorIds } = await import("./privacy-helpers.server");
    const neon = await import("./neon/features.server");
    const hidden = await getHiddenAuthorIds(context.userId);
    const rows = await neon.listNotifications(context.userId, hidden, {
      limit: PAGE_ROWS + 1,
      offset: from,
      type: data.typeFilter === "all" ? null : data.typeFilter,
    });

    const list = (rows ?? []) as unknown as RawNotification[];
    const hasMore = list.length > PAGE_ROWS;
    const items = groupNotifications(list.slice(0, PAGE_ROWS));

    // Follow-back state for follow groups
    const followActorIds = [
      ...new Set(items.filter((g) => g.type === "follow").flatMap((g) => g.actors.map((a) => a.id))),
    ];
    const followingIds =
      followActorIds.length > 0 ? await neon.listFollowingAmong(context.userId, followActorIds) : [];

    return { items, hasMore, followingIds };
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({ notificationIds: z.array(z.string().uuid()).min(1).max(200) })
      .parse(input),
  )
  .middleware([requireAuth])
  .handler(async ({ data, context }) => {
    const W = await import("./neon/writes.server");
    await W.markNotificationsRead(context.userId, data.notificationIds);
    return { success: true };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const W = await import("./neon/writes.server");
    await W.markNotificationsRead(context.userId, null);
    return { success: true };
  });

export const getNotificationSettings = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const W = await import("./neon/writes.server");
    await W.ensureActor(context.userId);
    return (await W.getOrCreateNotificationSettings(context.userId)) as unknown as NotificationSettings;
  });

export const updateNotificationSettings = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        email_likes: z.boolean(),
        email_replies: z.boolean(),
        email_follows: z.boolean(),
        email_reposts: z.boolean(),
      })
      .parse(input),
  )
  .middleware([requireAuth])
  .handler(async ({ data, context }) => {
    const W = await import("./neon/writes.server");
    await W.ensureActor(context.userId);
    return (await W.upsertNotificationSettings(context.userId, data)) as unknown as NotificationSettings;
  });

