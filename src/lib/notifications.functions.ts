import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  type: "like" | "reply" | "follow";
  read_at: string | null;
  created_at: string;
  post_id: string | null;
  actor: NotificationActor | null;
  post: NotificationPost | null;
}

export const getNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: notifications, error } = await context.supabase
      .from("notifications")
      .select(
        `
        id,
        type,
        read_at,
        created_at,
        post_id,
        actor:profiles!notifications_actor_id_profiles_fkey(id, username, display_name, avatar_url),
        post:posts!notifications_post_id_fkey(id, content)
      `,
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return (notifications ?? []) as unknown as Notification[];
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ notificationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.notificationId)
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
