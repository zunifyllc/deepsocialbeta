import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: notifications, error } = await context.supabase
      .from("notifications")
      .select(SELECT)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
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
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const from = data.page * PAGE_ROWS;
    let query = context.supabase
      .from("notifications")
      .select(SELECT)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_ROWS);

    if (data.typeFilter !== "all") query = query.eq("type", data.typeFilter);

    const { data: rows, error } = await query;
    if (error) throw error;

    const list = (rows ?? []) as unknown as RawNotification[];
    const hasMore = list.length > PAGE_ROWS;
    const items = groupNotifications(list.slice(0, PAGE_ROWS));

    // Follow-back state for follow groups
    const followActorIds = [
      ...new Set(items.filter((g) => g.type === "follow").flatMap((g) => g.actors.map((a) => a.id))),
    ];
    let followingIds: string[] = [];
    if (followActorIds.length > 0) {
      const { data: follows } = await context.supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", context.userId)
        .in("following_id", followActorIds);
      followingIds = (follows ?? []).map((f) => f.following_id);
    }

    return { items, hasMore, followingIds };
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({ notificationIds: z.array(z.string().uuid()).min(1).max(200) })
      .parse(input),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", data.notificationIds)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { success: true };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) throw error;
    return { success: true };
  });

export const getNotificationSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: existing, error } = await context.supabase
      .from("notification_settings")
      .select("user_id, email_likes, email_replies, email_follows, email_reposts")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (existing) return existing as NotificationSettings;

    const { data: created, error: insertError } = await context.supabase
      .from("notification_settings")
      .insert({ user_id: context.userId })
      .select("user_id, email_likes, email_replies, email_follows, email_reposts")
      .single();
    if (insertError) throw insertError;
    return created as NotificationSettings;
  });

export const updateNotificationSettings = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        email_likes: z.boolean().optional(),
        email_replies: z.boolean().optional(),
        email_follows: z.boolean().optional(),
        email_reposts: z.boolean().optional(),
      })
      .parse(input),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: updated, error } = await context.supabase
      .from("notification_settings")
      .upsert({ user_id: context.userId, ...data }, { onConflict: "user_id" })
      .select("user_id, email_likes, email_replies, email_follows, email_reposts")
      .single();
    if (error) throw error;
    return updated as NotificationSettings;
  });
