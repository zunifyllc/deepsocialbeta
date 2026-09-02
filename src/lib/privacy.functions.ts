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
      return { isMuted: false };
    }

    const { error } = await context.supabase
      .from("muted_users")
      .insert({ muted_by: context.userId, muted_user_id: data.targetUserId });
    if (error) throw error;
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

    return { isBlocked: true };
  });

async function loadProfiles(
  supabase: { from: (t: "profiles") => any },
  ids: string[],
): Promise<PrivacyUser[]> {
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", ids);
  return (data ?? []) as PrivacyUser[];
}

export const getMutedUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("muted_users")
      .select("muted_user_id")
      .eq("muted_by", context.userId);
    if (error) throw error;
    return loadProfiles(context.supabase, (data ?? []).map((r) => r.muted_user_id));
  });

export const getBlockedUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("blocked_users")
      .select("blocked_user_id")
      .eq("blocked_by", context.userId);
    if (error) throw error;
    return loadProfiles(context.supabase, (data ?? []).map((r) => r.blocked_user_id));
  });

/** Mute/block state between the signed-in user and another account. */
export const getRelationshipState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => targetSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (data.targetUserId === context.userId) {
      return { isMuted: false, isBlocked: false, blockedByThem: false };
    }
    const [{ data: mute }, { data: block }] = await Promise.all([
      context.supabase
        .from("muted_users")
        .select("id")
        .eq("muted_by", context.userId)
        .eq("muted_user_id", data.targetUserId)
        .maybeSingle(),
      context.supabase
        .from("blocked_users")
        .select("id")
        .eq("blocked_by", context.userId)
        .eq("blocked_user_id", data.targetUserId)
        .maybeSingle(),
    ]);

    const { getBlockState } = await import("./privacy-helpers.server");
    const state = await getBlockState(context.userId, data.targetUserId);

    return {
      isMuted: !!mute,
      isBlocked: !!block,
      blockedByThem: state === "by-them",
    };
  });
