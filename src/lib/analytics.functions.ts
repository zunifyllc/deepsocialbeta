import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-middleware";
export type { PostAnalytics, ProfileAnalytics, PostTimelinePoint, TimeRange } from "./analytics-helpers";

const rangeSchema = z.enum(["7d", "30d", "all"]).default("30d");

export const recordPostImpression = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const W = await import("./neon/writes.server");
    await W.ensureActor(context.userId);
    const post = await W.postAuthor(data.postId);
    if (post && post.author_id !== context.userId) {
      const { isBlockedBetween } = await import("./privacy-helpers.server");
      if (await isBlockedBetween(context.userId, post.author_id)) return { recorded: false };
    }
    return W.recordImpression(context.userId, data.postId);
  });

export const recordProfileVisit = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((input) => z.object({ profileId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const W = await import("./neon/writes.server");
    await W.ensureActor(context.userId);
    const { isBlockedBetween } = await import("./privacy-helpers.server");
    if (await isBlockedBetween(context.userId, data.profileId)) return { recorded: false };
    return W.recordVisit(context.userId, data.profileId);
  });

export const getPostAnalytics = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((input) => z.object({ postId: z.string().uuid(), range: rangeSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { loadPostAnalyticsNeon } = await import("./neon/features.server");
    return loadPostAnalyticsNeon(context.userId, data.postId, data.range);
  });

export const getProfileAnalytics = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((input) => z.object({ range: rangeSchema }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { loadProfileAnalyticsNeon } = await import("./neon/features.server");
    return loadProfileAnalyticsNeon(context.userId, data.range);
  });
