import { getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createPublicClient } from "./supabase-public";

/**
 * Resolves the signed-in user for otherwise-public read functions, so mute and
 * block filters can be applied without making those endpoints auth-only.
 * Returns null for anonymous/SSR calls with no bearer token.
 */
export async function getViewerId(): Promise<string | null> {
  let header: string | null | undefined;
  try {
    header = getRequestHeader("authorization");
  } catch {
    return null;
  }
  if (!header || !header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  try {
    const { data } = await createPublicClient().auth.getUser(token);
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Users the given user muted (one-way, silent). */
export async function getMutedIds(userId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("muted_users")
    .select("muted_user_id")
    .eq("muted_by", userId);
  return (data ?? []).map((row) => row.muted_user_id);
}

/** Users the given user blocked. */
export async function getBlockedIds(userId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("blocked_users")
    .select("blocked_user_id")
    .eq("blocked_by", userId);
  return (data ?? []).map((row) => row.blocked_user_id);
}

/** Users who blocked the given user (hard block is mutually invisible). */
export async function getBlockedByIds(userId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("blocked_users")
    .select("blocked_by")
    .eq("blocked_user_id", userId);
  return (data ?? []).map((row) => row.blocked_by);
}

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
  const { data } = await supabaseAdmin
    .from("blocked_users")
    .select("id")
    .or(
      `and(blocked_by.eq.${a},blocked_user_id.eq.${b}),and(blocked_by.eq.${b},blocked_user_id.eq.${a})`,
    )
    .limit(1);
  return (data ?? []).length > 0;
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
  const { data } = await supabaseAdmin
    .from("blocked_users")
    .select("blocked_by, blocked_user_id")
    .or(
      `and(blocked_by.eq.${viewerId},blocked_user_id.eq.${targetId}),and(blocked_by.eq.${targetId},blocked_user_id.eq.${viewerId})`,
    );
  const rows = data ?? [];
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
