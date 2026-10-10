import { idsWhere, blockRowsBetween } from "./neon/features.server";

/**
 * Resolves the signed-in user for otherwise-public read functions, so mute and
 * block filters can be applied without making those endpoints auth-only.
 * Returns null for anonymous/SSR calls with no bearer token.
 */
export async function getViewerId(): Promise<string | null> {
  try {
    const { getRequestHeaders } = await import("@tanstack/react-start/server");
    const { getSessionUserId } = await import("./auth.server");
    return await getSessionUserId(new Headers(getRequestHeaders() as unknown as HeadersInit));
  } catch {
    return null;
  }
}

/** Users the given user muted (one-way, silent). */
export const getMutedIds = (userId: string) => idsWhere("muted_users", "muted_user_id", "muted_by", userId);

/** Users the given user blocked. */
export const getBlockedIds = (userId: string) => idsWhere("blocked_users", "blocked_user_id", "blocked_by", userId);

/** Users who blocked the given user (hard block is mutually invisible). */
export const getBlockedByIds = (userId: string) => idsWhere("blocked_users", "blocked_by", "blocked_user_id", userId);

/** All author ids whose content must be hidden from this user. */
export async function getHiddenAuthorIds(userId: string): Promise<string[]> {
  const [muted, blocked, blockedBy] = await Promise.all([
    getMutedIds(userId),
    getBlockedIds(userId),
    getBlockedByIds(userId),
  ]);
  return [...new Set([...muted, ...blocked, ...blockedBy])];
}

/** Hidden author ids for the current request's viewer (empty when anonymous). */
export async function getViewerHiddenAuthorIds(): Promise<string[]> {
  const viewerId = await getViewerId();
  if (!viewerId) return [];
  return getHiddenAuthorIds(viewerId);
}

/** True when either user has blocked the other. */
export async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  return (await blockRowsBetween(a, b)).length > 0;
}

/** Throws when a block exists in either direction. */
export async function assertNotBlocked(a: string, b: string): Promise<void> {
  if (await isBlockedBetween(a, b)) {
    throw new Error("You cannot interact with this account due to a block");
  }
}

/** Which side of a block the pair is on, if any. */
export async function getBlockState(
  viewerId: string,
  targetId: string,
): Promise<"by-me" | "by-them" | null> {
  if (viewerId === targetId) return null;
  const rows = await blockRowsBetween(viewerId, targetId);
  if (rows.some((r) => r.blocked_by === viewerId)) return "by-me";
  if (rows.length > 0) return "by-them";
  return null;
}

/** Applies the hidden-author filter to a PostgREST query builder. */
export function excludeAuthors<T>(query: T, hiddenIds: string[], column = "author_id"): T {
  if (hiddenIds.length === 0) return query;
  return (query as unknown as { not: (c: string, op: string, v: string) => T }).not(
    column,
    "in",
    `(${hiddenIds.join(",")})`,
  );
}
