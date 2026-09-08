// Neon-backed post reads. Shapes match the Supabase/PostgREST payloads the UI
// already consumes (see `Post` in src/lib/posts.functions.ts).
import { q, one, type Row } from "./core.server";

const POST_COLUMNS = `
  p.id,
  p.content,
  p.parent_post_id,
  coalesce(p.media_urls, '{}'::text[]) as media_urls,
  p.like_count,
  p.reply_count,
  p.repost_count,
  p.created_at,
  p.updated_at,
  p.edited_at,
  p.is_edited,
  p.status,
  p.scheduled_at,
  case when a.id is null then null else to_jsonb(a) end as author,
  (select jsonb_build_object('id', pl.id) from polls pl where pl.post_id = p.id limit 1) as poll
`;

const FROM_POSTS = `from posts p left join profiles a on a.id = p.author_id`;

/** `author_id <> all(hidden)` guard that is a no-op for an empty list. */
const NOT_HIDDEN = `(coalesce(cardinality($1::uuid[]), 0) = 0 or p.author_id <> all($1::uuid[]))`;

export interface FeedOptions {
  limit: number;
  cursor?: string | undefined;
  hidden: string[];
}

export async function listFeedPosts(opts: FeedOptions): Promise<Row[]> {
  return q(
    `select ${POST_COLUMNS} ${FROM_POSTS}
     where p.status = 'published' and p.parent_post_id is null and ${NOT_HIDDEN}
       and ($2::timestamptz is null or p.created_at < $2::timestamptz)
     order by p.created_at desc limit $3`,
    [opts.hidden, opts.cursor ?? null, opts.limit],
  );
}

export async function listUserPosts(userId: string, opts: FeedOptions): Promise<Row[]> {
  return q(
    `select ${POST_COLUMNS} ${FROM_POSTS}
     where p.author_id = $4::uuid and p.status = 'published' and p.parent_post_id is null and ${NOT_HIDDEN}
       and ($2::timestamptz is null or p.created_at < $2::timestamptz)
     order by p.created_at desc limit $3`,
    [opts.hidden, opts.cursor ?? null, opts.limit, userId],
  );
}

export async function getPostById(postId: string): Promise<Row | null> {
  return one(`select ${POST_COLUMNS} ${FROM_POSTS} where p.id = $1::uuid`, [postId]);
}

export async function listReplies(postId: string, hidden: string[]): Promise<Row[]> {
  return q(
    `select ${POST_COLUMNS} ${FROM_POSTS}
     where p.parent_post_id = $2::uuid and p.status = 'published' and ${NOT_HIDDEN}
     order by p.created_at asc`,
    [hidden, postId],
  );
}

export async function listScheduledPosts(userId: string): Promise<Row[]> {
  return q(
    `select ${POST_COLUMNS} ${FROM_POSTS}
     where p.author_id = $1::uuid and p.status = 'scheduled'
     order by p.scheduled_at asc nulls last`,
    [userId],
  );
}

export async function listLikedPosts(userId: string, limit = 50): Promise<Row[]> {
  return q(
    `select ${POST_COLUMNS} ${FROM_POSTS}
     join likes l on l.post_id = p.id
     where l.user_id = $1::uuid
     order by l.created_at desc limit $2`,
    [userId, limit],
  );
}

export async function getPinnedPost(userId: string): Promise<Row | null> {
  return one(
    `select ${POST_COLUMNS} ${FROM_POSTS}
     where p.id = (select pinned_post_id from profiles where id = $1::uuid)`,
    [userId],
  );
}

export interface RepostFeedOptions extends FeedOptions {
  userId?: string | undefined;
  postId?: string | undefined;
}

/** Reposts shaped as feed items: the original post plus `repost` metadata. */
export async function listRepostFeedItems(opts: RepostFeedOptions): Promise<Row[]> {
  const rows = await q<Row>(
    `select r.id as repost_id, r.created_at as reposted_at, r.quote_content,
            to_jsonb(u) as reposted_by, ${POST_COLUMNS}
     from reposts r
     join posts p on p.id = r.post_id
     join profiles u on u.id = r.user_id
     left join profiles a on a.id = p.author_id
     where ${NOT_HIDDEN}
       and (coalesce(cardinality($1::uuid[]), 0) = 0 or r.user_id <> all($1::uuid[]))
       and ($2::timestamptz is null or r.created_at < $2::timestamptz)
       and ($4::uuid is null or r.user_id = $4::uuid)
       and ($5::uuid is null or r.post_id = $5::uuid)
     order by r.created_at desc limit $3`,
    [opts.hidden, opts.cursor ?? null, opts.limit, opts.userId ?? null, opts.postId ?? null],
  );

  return rows.map((row) => {
    const { repost_id, reposted_at, quote_content, reposted_by, ...post } = row;
    return {
      ...post,
      feedKey: `repost-${String(repost_id)}`,
      repost: {
        id: repost_id,
        reposted_at,
        quote_content: quote_content ?? null,
        repostedBy: reposted_by,
      },
    } as Row;
  });
}

/** Live repost count for a post. */
export async function countReposts(postId: string): Promise<number> {
  const row = await one<{ count: number }>(
    `select count(*)::int as count from reposts where post_id = $1::uuid`,
    [postId],
  );
  return row?.count ?? 0;
}
