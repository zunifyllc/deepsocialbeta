import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface PrivacyUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

const targetSchema = z.object({ targetUserId: z.string().uuid() });

export const toggleMute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => targetSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (data.targetUserId === context.userId) throw new Error("Cannot mute yourself");

    const { data: existing } = await context.supabase
      .from("muted_users")
      .select("id")
      .eq("muted_by", context.userId)
      .eq("muted_user_id", data.targetUserId)
      .maybeSingle();

    if (existing) {
      const { error } = await context.supabase.from("muted_users").delete().eq("id", existing.id);
      if (error) throw error;
      await (await import("./neon/mirror.server")).resyncScope("muted_users", "muted_by", context.userId);
      return { isMuted: false };
    }

    const { error } = await context.supabase
      .from("muted_users")
      .insert({ muted_by: context.userId, muted_user_id: data.targetUserId });
    if (error) throw error;
    await (await import("./neon/mirror.server")).resyncScope("muted_users", "muted_by", context.userId);
    return { isMuted: true };
  });

export const toggleBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => targetSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (data.targetUserId === context.userId) throw new Error("Cannot block yourself");
    const me = context.userId;
    const them = data.targetUserId;

    const { data: existing } = await context.supabase
      .from("blocked_users")
      .select("id")
      .eq("blocked_by", me)
      .eq("blocked_user_id", them)
      .maybeSingle();

    if (existing) {
      const { error } = await context.supabase.from("blocked_users").delete().eq("id", existing.id);
      if (error) throw error;
      await (await import("./neon/mirror.server")).resyncScope("blocked_users", "blocked_by", me);
      return { isBlocked: false };
    }

    const { error } = await context.supabase
      .from("blocked_users")
      .insert({ blocked_by: me, blocked_user_id: them });
    if (error) throw error;

    // Sever the relationship with elevated privileges: the other side's rows
    // are not reachable through the viewer's RLS policies.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin
      .from("follows")
      .delete()
      .or(
        `and(follower_id.eq.${me},following_id.eq.${them}),and(follower_id.eq.${them},following_id.eq.${me})`,
      );

    const { data: myPosts } = await supabaseAdmin.from("posts").select("id").eq("author_id", me);
    if (myPosts?.length) {
      const ids = myPosts.map((p) => p.id);
      await supabaseAdmin.from("likes").delete().in("post_id", ids).eq("user_id", them);
      await supabaseAdmin.from("reposts").delete().in("post_id", ids).eq("user_id", them);
    }

    const { data: theirPosts } = await supabaseAdmin.from("posts").select("id").eq("author_id", them);
    if (theirPosts?.length) {
      const ids = theirPosts.map((p) => p.id);
      await supabaseAdmin.from("likes").delete().in("post_id", ids).eq("user_id", me);
      await supabaseAdmin.from("reposts").delete().in("post_id", ids).eq("user_id", me);
    }

    await supabaseAdmin
      .from("notifications")
      .delete()
      .or(
        `and(user_id.eq.${me},actor_id.eq.${them}),and(user_id.eq.${them},actor_id.eq.${me})`,
      );

    const mirror = await import("./neon/mirror.server");
    await mirror.resyncScope("blocked_users", "blocked_by", me);
    for (const id of [me, them]) {
      await mirror.resyncScope("follows", "follower_id", id);
      await mirror.resyncScope("likes", "user_id", id);
      await mirror.resyncScope("reposts", "user_id", id);
      await mirror.resyncScope("notifications", "user_id", id);
    }
    await mirror.recountForAuthors([me, them]);
    return { isBlocked: true };
  });

export const getMutedUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const neon = await import("./neon/features.server");
    const ids = await neon.idsWhere("muted_users", "muted_user_id", "muted_by", context.userId);
    return (await neon.privacyProfiles(ids)) as unknown as PrivacyUser[];
  });

export const getBlockedUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const neon = await import("./neon/features.server");
    const ids = await neon.idsWhere("blocked_users", "blocked_user_id", "blocked_by", context.userId);
    return (await neon.privacyProfiles(ids)) as unknown as PrivacyUser[];
  });

/** Mute/block state between the signed-in user and another account. */
export const getRelationshipState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => targetSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (data.targetUserId === context.userId) {
      return { isMuted: false, isBlocked: false, blockedByThem: false };
    }
    const neon = await import("./neon/features.server");
    const [isMuted, rows] = await Promise.all([
      neon.isMutedBy(context.userId, data.targetUserId),
      neon.blockRowsBetween(context.userId, data.targetUserId),
    ]);
    return {
      isMuted,
      isBlocked: rows.some((r) => r.blocked_by === context.userId),
      blockedByThem: rows.some((r) => r.blocked_by === data.targetUserId),
    };
  });
