import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordImpression, recordVisit } from "./analytics-helpers";
export type { PostAnalytics, ProfileAnalytics, PostTimelinePoint, TimeRange } from "./analytics-helpers";

const rangeSchema = z.enum(["7d", "30d", "all"]).default("30d");

export const recordPostImpression = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: post } = await context.supabase
      .from("posts")
      .select("author_id")
      .eq("id", data.postId)
      .maybeSingle();
    if (post && post.author_id !== context.userId) {
      const { isBlockedBetween } = await import("./privacy-helpers.server");
      if (await isBlockedBetween(context.userId, post.author_id)) return { recorded: false };
    }
    const result = await recordImpression(context.supabase, context.userId, data.postId);
    if (result.recorded) {
      const { resyncScope } = await import("./neon/mirror.server");
      await resyncScope("post_impressions", "post_id", data.postId);
    }
    return result;
  });

export const recordProfileVisit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ profileId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { isBlockedBetween } = await import("./privacy-helpers.server");
    if (await isBlockedBetween(context.userId, data.profileId)) return { recorded: false };
    const result = await recordVisit(context.supabase, context.userId, data.profileId);
    if (result.recorded) {
      const { resyncScope } = await import("./neon/mirror.server");
      await resyncScope("profile_visits", "profile_id", data.profileId);
    }
    return result;
  });

export const getPostAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ postId: z.string().uuid(), range: rangeSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { loadPostAnalyticsNeon } = await import("./neon/features.server");
    return loadPostAnalyticsNeon(context.userId, data.postId, data.range);
  });

export const getProfileAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ range: rangeSchema }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { loadProfileAnalyticsNeon } = await import("./neon/features.server");
    return loadProfileAnalyticsNeon(context.userId, data.range);
  });
