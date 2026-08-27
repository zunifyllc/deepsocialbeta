import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  loadPostAnalytics,
  loadProfileAnalytics,
  recordImpression,
  recordVisit,
} from "./analytics-helpers";
export type { PostAnalytics, ProfileAnalytics, PostTimelinePoint, TimeRange } from "./analytics-helpers";

const rangeSchema = z.enum(["7d", "30d", "all"]).default("30d");

export const recordPostImpression = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ postId: z.string().uuid() }).parse(input))
  .handler(({ data, context }) => recordImpression(context.supabase, context.userId, data.postId));

export const recordProfileVisit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ profileId: z.string().uuid() }).parse(input))
  .handler(({ data, context }) => recordVisit(context.supabase, context.userId, data.profileId));

export const getPostAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ postId: z.string().uuid(), range: rangeSchema }).parse(input))
  .handler(({ data, context }) =>
    loadPostAnalytics(context.supabase, context.userId, data.postId, data.range),
  );

export const getProfileAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ range: rangeSchema }).parse(input ?? {}))
  .handler(({ data, context }) => loadProfileAnalytics(context.supabase, context.userId, data.range));
