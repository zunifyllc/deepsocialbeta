import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-middleware";

export interface PrivacyUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

const targetSchema = z.object({ targetUserId: z.string().uuid() });

export const toggleMute = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((input) => targetSchema.parse(input))
  .handler(async ({ data, context }) => {
    const W = await import("./neon/writes.server");
    if (data.targetUserId === context.userId) throw new Error("Cannot mute yourself");
    await W.ensureActor(context.userId);
    return W.toggleMute(context.userId, data.targetUserId);
  });

export const toggleBlock = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((input) => targetSchema.parse(input))
  .handler(async ({ data, context }) => {
    const W = await import("./neon/writes.server");
    if (data.targetUserId === context.userId) throw new Error("Cannot block yourself");
    await W.ensureActor(context.userId);
    return W.toggleBlock(context.userId, data.targetUserId);
  });

export const getMutedUsers = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const neon = await import("./neon/features.server");
    const ids = await neon.idsWhere("muted_users", "muted_user_id", "muted_by", context.userId);
    return (await neon.privacyProfiles(ids)) as unknown as PrivacyUser[];
  });

export const getBlockedUsers = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const neon = await import("./neon/features.server");
    const ids = await neon.idsWhere("blocked_users", "blocked_user_id", "blocked_by", context.userId);
    return (await neon.privacyProfiles(ids)) as unknown as PrivacyUser[];
  });

/** Mute/block state between the signed-in user and another account. */
export const getRelationshipState = createServerFn({ method: "GET" })
  .middleware([requireAuth])
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
