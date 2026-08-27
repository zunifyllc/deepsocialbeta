import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

export type TimeRange = "7d" | "30d" | "all";

export interface PostTimelinePoint {
  date: string;
  impressions: number;
  likes: number;
  reposts: number;
  replies: number;
  bookmarks: number;
}

export interface PostAnalytics {
  post: { id: string; content: string; created_at: string };
  totals: {
    impressions: number;
    likes: number;
    reposts: number;
    replies: number;
    bookmarks: number;
  };
  dailyTimeline: PostTimelinePoint[];
}

export interface ProfileAnalytics {
  totalVisits: number;
  dailyTimeline: { date: string; visits: number }[];
}

export function sinceFor(range: TimeRange): string | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

const day = (iso: string) => iso.slice(0, 10);

/** Counts rows per calendar day (UTC) from a list of timestamps. */
export function groupByDay(timestamps: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const ts of timestamps) {
    const d = day(ts);
    map[d] = (map[d] ?? 0) + 1;
  }
  return map;
}

async function fetchDates(
  supabase: Client,
  table: "post_impressions" | "likes" | "reposts" | "bookmarks",
  column: string,
  postId: string,
  since: string | null,
): Promise<string[]> {
  let query = supabase.from(table).select(column).eq("post_id", postId);
  if (since) query = query.gte(column, since);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, string>[]).map((row) => row[column]!).filter(Boolean);
}

export async function loadPostAnalytics(
  supabase: Client,
  userId: string,
  postId: string,
  range: TimeRange,
): Promise<PostAnalytics> {
  const { data: post, error: postError } = await supabase
    .from("posts")
    .select("id, author_id, content, created_at")
    .eq("id", postId)
    .maybeSingle();
  if (postError) throw postError;
  if (!post) throw new Error("Post not found");
  if (post.author_id !== userId) throw new Error("Unauthorized");

  const since = sinceFor(range);

  const [impressions, likes, reposts, bookmarks] = await Promise.all([
    fetchDates(supabase, "post_impressions", "viewed_at", postId, since),
    fetchDates(supabase, "likes", "created_at", postId, since),
    fetchDates(supabase, "reposts", "created_at", postId, since),
    fetchDates(supabase, "bookmarks", "created_at", postId, since),
  ]);

  let repliesQuery = supabase.from("posts").select("created_at").eq("parent_post_id", postId);
  if (since) repliesQuery = repliesQuery.gte("created_at", since);
  const { data: replyRows, error: replyError } = await repliesQuery;
  if (replyError) throw replyError;
  const replies = (replyRows ?? []).map((r) => r.created_at);

  const maps = {
    impressions: groupByDay(impressions),
    likes: groupByDay(likes),
    reposts: groupByDay(reposts),
    replies: groupByDay(replies),
    bookmarks: groupByDay(bookmarks),
  };

  const dates = Array.from(
    new Set([
      ...Object.keys(maps.impressions),
      ...Object.keys(maps.likes),
      ...Object.keys(maps.reposts),
      ...Object.keys(maps.replies),
      ...Object.keys(maps.bookmarks),
    ]),
  ).sort();

  return {
    post: { id: post.id, content: post.content, created_at: post.created_at },
    totals: {
      impressions: impressions.length,
      likes: likes.length,
      reposts: reposts.length,
      replies: replies.length,
      bookmarks: bookmarks.length,
    },
    dailyTimeline: dates.map((date) => ({
      date,
      impressions: maps.impressions[date] ?? 0,
      likes: maps.likes[date] ?? 0,
      reposts: maps.reposts[date] ?? 0,
      replies: maps.replies[date] ?? 0,
      bookmarks: maps.bookmarks[date] ?? 0,
    })),
  };
}

export async function loadProfileAnalytics(
  supabase: Client,
  userId: string,
  range: TimeRange,
): Promise<ProfileAnalytics> {
  const since = sinceFor(range);
  let query = supabase.from("profile_visits").select("visited_at").eq("profile_id", userId);
  if (since) query = query.gte("visited_at", since);
  const { data, error } = await query;
  if (error) throw error;

  const map = groupByDay((data ?? []).map((v) => v.visited_at));
  return {
    totalVisits: data?.length ?? 0,
    dailyTimeline: Object.entries(map)
      .map(([date, visits]) => ({ date, visits }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export async function recordImpression(supabase: Client, userId: string, postId: string) {
  const { data: post } = await supabase.from("posts").select("author_id").eq("id", postId).maybeSingle();
  if (!post || post.author_id === userId) return { recorded: false };
  const { error } = await supabase.from("post_impressions").insert({ post_id: postId, user_id: userId });
  if (error) return { recorded: false };
  return { recorded: true };
}

export async function recordVisit(supabase: Client, userId: string, profileId: string) {
  if (profileId === userId) return { recorded: false };
  const { error } = await supabase.from("profile_visits").insert({ profile_id: profileId, visitor_id: userId });
  if (error) return { recorded: false };
  return { recorded: true };
}
