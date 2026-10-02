// Neon-backed reads for search, notifications, messages, polls, lists,
// analytics, privacy and admin. Shapes match the previous Supabase payloads.
import { q, one, type Row } from "./core.server";
import { POST_COLUMNS, FROM_POSTS } from "./posts.server";
import { endsAtMs } from "@/lib/poll-helpers";
import type { PollResults } from "@/lib/poll-helpers";
import { groupByDay, sinceFor, type PostAnalytics, type ProfileAnalytics, type TimeRange } from "@/lib/analytics-helpers";

const notHidden = (col: string, n: number) =>
  `(coalesce(cardinality($${n}::uuid[]), 0) = 0 or ${col} <> all($${n}::uuid[]))`;

const escapeLike = (v: string) => v.replace(/[\\%_]/g, (m) => `\\${m}`);

const participant = (alias: string) =>
  `case when ${alias}.id is null then null else jsonb_build_object('id', ${alias}.id, 'username', ${alias}.username,
   'display_name', ${alias}.display_name, 'avatar_url', ${alias}.avatar_url, 'is_verified', ${alias}.is_verified) end`;

// ---------------------------------------------------------------- search ---
export async function searchUsers(term: string, hidden: string[], limit: number) {
  const pattern = `%${escapeLike(term)}%`;
  return q(
    `select * from profiles where (username ilike $1 or display_name ilike $1) and ${notHidden("id", 2)} limit $3`,
    [pattern, hidden, limit],
  );
}

export async function searchPosts(term: string, hidden: string[], sort: string, limit: number, offset: number) {
  const pattern = `%${escapeLike(term)}%`;
  const order = sort === "latest" ? "p.created_at desc" : "p.like_count desc, p.created_at desc";
  return q(
    `select ${POST_COLUMNS} ${FROM_POSTS} where p.content ilike $2 and ${notHidden("p.author_id", 1)}
     order by ${order} limit $3 offset $4`,
    [hidden, pattern, limit, offset],
  );
}

export async function hashtagPosts(tag: string, limit: number, offset: number) {
  return q(
    `select ${POST_COLUMNS} ${FROM_POSTS} where p.content ilike $1 and p.parent_post_id is null
     order by p.created_at desc limit $2 offset $3`,
    [`%#${escapeLike(tag)}%`, limit, offset],
  );
}

export async function trendingHashtags(limit: number) {
  return q<{ hashtag: string; post_count: number | string }>(
    `select * from get_trending_hashtags($1::int)`,
    [limit],
  );
}

// --------------------------------------------------------- notifications ---
const NOTIF_SELECT = `
  select n.id, n.type, n.read_at, n.created_at, n.post_id,
    case when a.id is null then null else jsonb_build_object('id', a.id, 'username', a.username,
      'display_name', a.display_name, 'avatar_url', a.avatar_url) end as actor,
    case when po.id is null then null else jsonb_build_object('id', po.id, 'content', po.content) end as post
  from notifications n
  left join profiles a on a.id = n.actor_id
  left join posts po on po.id = n.post_id`;

export async function listNotifications(
  userId: string,
  hidden: string[],
  opts: { limit: number; offset?: number; type?: string | null },
) {
  return q(
    `${NOTIF_SELECT} where n.user_id = $1::uuid and ${notHidden("n.actor_id", 2)}
       and ($3::text is null or n.type = $3)
     order by n.created_at desc limit $4 offset $5`,
    [userId, hidden, opts.type ?? null, opts.limit, opts.offset ?? 0],
  );
}

export async function listFollowingAmong(userId: string, ids: string[]) {
  const rows = await q<{ following_id: string }>(
    `select following_id from follows where follower_id = $1::uuid and following_id = any($2::uuid[])`,
    [userId, ids],
  );
  return rows.map((r) => r.following_id);
}

export async function getNotificationSettingsRow(userId: string) {
  return one(
    `select user_id, email_likes, email_replies, email_follows, email_reposts
     from notification_settings where user_id = $1::uuid`,
    [userId],
  );
}

// -------------------------------------------------------------- messages ---
export async function listConversations(userId: string) {
  return q(
    `select c.id, c.created_at, c.updated_at,
       (select ${participant("pr")} from profiles pr
         where pr.id = (select x from unnest(c.participants) x where x <> $1::uuid limit 1)) as other,
       (select jsonb_build_object('id', m.id, 'content', m.content, 'created_at', m.created_at, 'sender_id', m.sender_id)
         from messages m where m.conversation_id = c.id order by m.created_at desc limit 1) as last_message
     from conversations c where $1::uuid = any(c.participants)
     order by c.updated_at desc limit 50`,
    [userId],
  );
}

export async function getConversationFor(userId: string, conversationId: string) {
  return one<{ id: string; other: Row | null }>(
    `select c.id,
       (select ${participant("pr")} from profiles pr
         where pr.id = (select x from unnest(c.participants) x where x <> $1::uuid limit 1)) as other
     from conversations c where c.id = $2::uuid and $1::uuid = any(c.participants)`,
    [userId, conversationId],
  );
}

export async function listMessages(userId: string, conversationId: string) {
  return q(
    `select m.id, m.conversation_id, m.sender_id, m.content, m.created_at, ${participant("s")} as sender
     from messages m
     join conversations c on c.id = m.conversation_id and $1::uuid = any(c.participants)
     left join profiles s on s.id = m.sender_id
     where m.conversation_id = $2::uuid
     order by m.created_at asc limit 200`,
    [userId, conversationId],
  );
}

// ----------------------------------------------------------------- polls ---
export async function readPollResultsNeon(pollId: string, userId: string | null): Promise<PollResults> {
  const poll = await one<{ id: string; post_id: string; created_at: string; duration: string | null }>(
    `select id, post_id, created_at, duration::text as duration from polls where id = $1::uuid`,
    [pollId],
  );
  if (!poll) throw new Error("Poll not found");
  const options = await q<{ id: string; content: string; position: number }>(
    `select id, content, position from poll_options where poll_id = $1::uuid order by position asc`,
    [pollId],
  );
  const votes = await q<{ option_id: string; user_id: string }>(
    `select option_id, user_id from poll_votes where poll_id = $1::uuid`,
    [pollId],
  );
  const counts = new Map<string, number>();
  for (const v of votes) counts.set(v.option_id, (counts.get(v.option_id) ?? 0) + 1);
  const endsAt = poll.duration ? new Date(endsAtMs(poll.created_at, poll.duration)).toISOString() : null;
  return {
    pollId: poll.id,
    postId: poll.post_id,
    createdAt: poll.created_at,
    endsAt,
    expired: endsAt ? Date.now() > new Date(endsAt).getTime() : false,
    totalVotes: votes.length,
    userVotedOptionId: userId ? votes.find((v) => v.user_id === userId)?.option_id ?? null : null,
    options: options.map((o) => ({ ...o, voteCount: counts.get(o.id) ?? 0 })),
  };
}

// ----------------------------------------------------------------- lists ---
const LIST_COLS = `l.id, l.creator_id, l.name, l.description, l.is_public, l.created_at, l.updated_at`;
/** Mirrors the list RLS rule: public lists, or the viewer's own. */
const LIST_VISIBLE = (n: number) => `(l.is_public or l.creator_id = $${n}::uuid)`;

export async function listUserLists(viewerId: string, creatorId: string) {
  return q(
    `select ${LIST_COLS}, (select count(*)::int from list_members lm where lm.list_id = l.id) as member_count
     from lists l where l.creator_id = $2::uuid and ${LIST_VISIBLE(1)} order by l.created_at desc`,
    [viewerId, creatorId],
  );
}

export async function getVisibleList(viewerId: string, listId: string) {
  return one<Row & { creator_id: string }>(
    `select ${LIST_COLS} from lists l where l.id = $2::uuid and ${LIST_VISIBLE(1)}`,
    [viewerId, listId],
  );
}

export async function listMembersOf(listId: string) {
  const rows = await q<{ user: Row | null }>(
    `select ${participant("u")} as user from list_members lm left join profiles u on u.id = lm.user_id
     where lm.list_id = $1::uuid order by lm.added_at desc`,
    [listId],
  );
  return rows.map((r) => r.user).filter((u): u is Row => !!u);
}

export async function getParticipant(id: string) {
  const row = await one<{ p: Row | null }>(`select ${participant("u")} as p from profiles u where u.id = $1::uuid`, [id]);
  return row?.p ?? null;
}

export async function listFeedForList(listId: string, limit: number, cursor?: string) {
  return q(
    `select ${POST_COLUMNS} ${FROM_POSTS}
     where p.author_id in (select user_id from list_members where list_id = $1::uuid)
       and p.parent_post_id is null and p.status = 'published'
       and ($2::timestamptz is null or p.created_at < $2::timestamptz)
     order by p.created_at desc limit $3`,
    [listId, cursor ?? null, limit],
  );
}

export async function listsContaining(viewerId: string, userId: string) {
  return q(
    `select ${LIST_COLS} from list_members lm join lists l on l.id = lm.list_id
     where lm.user_id = $2::uuid and ${LIST_VISIBLE(1)}`,
    [viewerId, userId],
  );
}

export async function listMembershipsFor(viewerId: string, userId: string) {
  return q(
    `select ${LIST_COLS}, exists(select 1 from list_members lm where lm.list_id = l.id and lm.user_id = $2::uuid) as "isMember"
     from lists l where l.creator_id = $1::uuid order by l.created_at desc`,
    [viewerId, userId],
  );
}

// ------------------------------------------------------------- analytics ---
async function dates(table: string, column: string, postId: string, since: string | null, key = "post_id") {
  const rows = await q<{ ts: string }>(
    `select ${column} as ts from ${table} where ${key} = $1::uuid and ($2::timestamptz is null or ${column} >= $2::timestamptz)`,
    [postId, since],
  );
  return rows.map((r) => r.ts).filter(Boolean);
}

export async function loadPostAnalyticsNeon(userId: string, postId: string, range: TimeRange): Promise<PostAnalytics> {
  const post = await one<{ id: string; author_id: string; content: string; created_at: string }>(
    `select id, author_id, content, created_at from posts where id = $1::uuid`,
    [postId],
  );
  if (!post) throw new Error("Post not found");
  if (post.author_id !== userId) throw new Error("Unauthorized");
  const since = sinceFor(range);
  const [impressions, likes, reposts, bookmarks, replies] = await Promise.all([
    dates("post_impressions", "viewed_at", postId, since),
    dates("likes", "created_at", postId, since),
    dates("reposts", "created_at", postId, since),
    dates("bookmarks", "created_at", postId, since),
    dates("posts", "created_at", postId, since, "parent_post_id"),
  ]);
  const maps = {
    impressions: groupByDay(impressions),
    likes: groupByDay(likes),
    reposts: groupByDay(reposts),
    replies: groupByDay(replies),
    bookmarks: groupByDay(bookmarks),
  };
  const all = Array.from(new Set(Object.values(maps).flatMap((m) => Object.keys(m)))).sort();
  return {
    post: { id: post.id, content: post.content, created_at: post.created_at },
    totals: {
      impressions: impressions.length,
      likes: likes.length,
      reposts: reposts.length,
      replies: replies.length,
      bookmarks: bookmarks.length,
    },
    dailyTimeline: all.map((date) => ({
      date,
      impressions: maps.impressions[date] ?? 0,
      likes: maps.likes[date] ?? 0,
      reposts: maps.reposts[date] ?? 0,
      replies: maps.replies[date] ?? 0,
      bookmarks: maps.bookmarks[date] ?? 0,
    })),
  };
}

export async function loadProfileAnalyticsNeon(userId: string, range: TimeRange): Promise<ProfileAnalytics> {
  const visits = await dates("profile_visits", "visited_at", userId, sinceFor(range), "profile_id");
  const map = groupByDay(visits);
  return {
    totalVisits: visits.length,
    dailyTimeline: Object.entries(map)
      .map(([date, v]) => ({ date, visits: v }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// --------------------------------------------------------------- privacy ---
export async function idsWhere(table: "muted_users" | "blocked_users", select: string, column: string, userId: string) {
  const rows = await q<{ v: string }>(`select ${select} as v from ${table} where ${column} = $1::uuid`, [userId]);
  return rows.map((r) => r.v);
}

export async function privacyProfiles(ids: string[]) {
  if (ids.length === 0) return [];
  return q(`select id, username, display_name, avatar_url from profiles where id = any($1::uuid[])`, [ids]);
}

export async function blockRowsBetween(a: string, b: string) {
  return q<{ blocked_by: string; blocked_user_id: string }>(
    `select blocked_by, blocked_user_id from blocked_users
     where (blocked_by = $1::uuid and blocked_user_id = $2::uuid) or (blocked_by = $2::uuid and blocked_user_id = $1::uuid)`,
    [a, b],
  );
}

export async function isMutedBy(userId: string, target: string) {
  return !!(await one(`select 1 from muted_users where muted_by = $1::uuid and muted_user_id = $2::uuid`, [userId, target]));
}

// ----------------------------------------------------------------- admin ---
export async function hasAdminRole(userId: string) {
  return !!(await one(`select 1 from user_roles where user_id = $1::uuid and role = 'admin'`, [userId]));
}

export async function listUsersNeon(opts: { search?: string | undefined; page: number; pageSize: number }) {
  const term = opts.search?.trim();
  return q(
    `select id, username, display_name, avatar_url, is_verified, created_at from profiles
     where ($1::text is null or username ilike $1 or display_name ilike $1)
     order by created_at desc limit $2 offset $3`,
    [term ? `%${escapeLike(term)}%` : null, opts.pageSize, opts.page * opts.pageSize],
  );
}
