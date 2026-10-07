import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const toggleFollow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ followingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const W = await import("./neon/writes.server");
    if (data.followingId === context.userId) throw new Error("Cannot follow yourself");
    await W.ensureActor(context.supabase, context.userId);
    const { assertNotBlocked } = await import("./privacy-helpers.server");
    await assertNotBlocked(context.userId, data.followingId);
    return W.toggleFollow(context.userId, data.followingId);
  });

export const getFollowStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ followingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getFollowState } = await import("./neon/social.server");
    return getFollowState(context.userId, data.followingId);
  });

export const getFollowCounts = createServerFn({ method: "GET" })
  .validator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { getFollowCounts: readCounts } = await import("./neon/social.server");
    return readCounts(data.userId);
  });

export interface SuggestedUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

export const getSuggestedUsers = createServerFn({ method: "GET" })
  .validator((input) => z.object({ limit: z.number().min(1).max(20).default(5) }).parse(input))
  .handler(async ({ data }) => {
    const [{ getViewerHiddenAuthorIds }, { listSuggestedUsers }] = await Promise.all([
      import("./privacy-helpers.server"),
      import("./neon/social.server"),
    ]);
    const hidden = await getViewerHiddenAuthorIds();
    const rows = await listSuggestedUsers(data.limit, hidden);
    return rows as unknown as SuggestedUser[];
  });
