import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const POST_WITH_AUTHOR = `
  id,
  content,
  parent_post_id,
  media_urls,
  like_count,
  reply_count,
  repost_count,
  created_at,
  updated_at,
  author:profiles!posts_author_id_profiles_fkey(*)
`;

export const REPOST_WITH_POST = `
  id,
  created_at,
  quote_content,
  user:profiles!reposts_user_id_profiles_fkey(id, username, display_name, avatar_url, is_verified),
  post:posts!reposts_post_id_fkey(${POST_WITH_AUTHOR})
`;

type Client = SupabaseClient<Database>;

interface RepostRow {
  id: string;
  created_at: string;
  quote_content: string | null;
  user: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    is_verified?: boolean;
  } | null;
  post: Record<string, unknown> | null;
}

/**
 * Fetches reposts (optionally scoped to a user) and shapes them as feed items:
 * the original post plus `repost` metadata describing who reposted it.
 */
export async function fetchRepostFeedItems(
  supabase: Client,
  opts: { userId?: string; limit: number; cursor?: string },
) {
  let query = supabase
    .from("reposts")
    .select(REPOST_WITH_POST)
    .order("created_at", { ascending: false })
    .limit(opts.limit);

  if (opts.userId) query = query.eq("user_id", opts.userId);
  if (opts.cursor) query = query.lt("created_at", opts.cursor);

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as unknown as RepostRow[])
    .filter((row) => row.post && row.user)
    .map((row) => ({
      ...(row.post as Record<string, unknown>),
      feedKey: `repost-${row.id}`,
      repost: {
        id: row.id,
        reposted_at: row.created_at,
        quote_content: row.quote_content,
        repostedBy: row.user!,
      },
    }));
}

/** Merges plain posts and repost feed items into one reverse-chronological list. */
export function mergeFeedItems<T extends { id: string; created_at: string; repost?: { reposted_at: string } | null }>(
  posts: T[],
  reposts: T[],
  limit: number,
): T[] {
  const stamp = (item: T) => item.repost?.reposted_at ?? item.created_at;
  return [...posts.map((p) => ({ ...p, feedKey: `post-${p.id}` })), ...reposts]
    .sort((a, b) => new Date(stamp(b as T)).getTime() - new Date(stamp(a as T)).getTime())
    .slice(0, limit) as T[];
}

/** Live repost count for a post, read from the reposts table. */
export async function readRepostCount(supabase: Client, postId: string): Promise<number> {
  const { count } = await supabase
    .from("reposts")
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId);
  return count ?? 0;
}
