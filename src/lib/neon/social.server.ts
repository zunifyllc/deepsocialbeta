// Neon-backed reads for likes, follows, reposts and bookmarks.
import { q, one, type Row } from "./core.server";

/* ---------------------------------- likes --------------------------------- */

export async function isLiked(userId: string, postId: string): Promise<boolean> {
  const row = await one(`select id from likes where user_id = $1::uuid and post_id = $2::uuid`, [
    userId,
    postId,
  ]);
  return !!row;
}

/* --------------------------------- follows -------------------------------- */

export async function getFollowState(
  userId: string,
  targetId: string,
): Promise<{ following: boolean; followedBy: boolean }> {
  const row = await one<{ following: boolean; followed_by: boolean }>(
    `select
       exists (select 1 from follows where follower_id = $1::uuid and following_id = $2::uuid) as following,
       exists (select 1 from follows where follower_id = $2::uuid and following_id = $1::uuid) as followed_by`,
    [userId, targetId],
  );
  return { following: !!row?.following, followedBy: !!row?.followed_by };
}

export async function getFollowCounts(
  userId: string,
): Promise<{ following: number; followers: number }> {
  const row = await one<{ following_count: number; followers_count: number }>(
    `select
       (select count(*)::int from follows where follower_id = $1::uuid) as following_count,
       (select count(*)::int from follows where following_id = $1::uuid) as followers_count`,
    [userId],
  );
  return { following: row?.following_count ?? 0, followers: row?.followers_count ?? 0 };
}

export async function listSuggestedUsers(limit: number, hidden: string[]): Promise<Row[]> {
  return q(
    `select id, username, display_name, avatar_url, bio from profiles
     where (coalesce(cardinality($1::uuid[]), 0) = 0 or id <> all($1::uuid[]))
     limit $2`,
    [hidden, limit],
  );
}

/* --------------------------------- reposts -------------------------------- */

export async function isReposted(userId: string, postId: string): Promise<boolean> {
  const row = await one(`select id from reposts where user_id = $1::uuid and post_id = $2::uuid`, [
    userId,
    postId,
  ]);
  return !!row;
}

/** Users who reposted a post, newest first, with their quote text. */
export async function listRepostersByPost(postId: string): Promise<Row[]> {
  return q(
    `select u.id, u.username, u.display_name, u.avatar_url, u.is_verified,
            r.quote_content, r.created_at
     from reposts r join profiles u on u.id = r.user_id
     where r.post_id = $1::uuid
     order by r.created_at desc`,
    [postId],
  );
}

/* -------------------------------- bookmarks ------------------------------- */

export async function getBookmark(
  userId: string,
  postId: string,
): Promise<{ id: string; collection_id: string | null } | null> {
  return one(
    `select id, collection_id from bookmarks where user_id = $1::uuid and post_id = $2::uuid`,
    [userId, postId],
  );
}

export interface BookmarkListOptions {
  limit: number;
  cursor?: string | undefined;
  scope: "all" | "unsorted" | "collection";
  collectionId?: string | null | undefined;
}

/** Bookmarked posts, shaped like feed items with bookmark metadata attached. */
export async function listBookmarkedPosts(
  userId: string,
  opts: BookmarkListOptions,
): Promise<Row[]> {
  const rows = await q<Row>(
    `select b.id as bookmark_id, b.created_at as bookmarked_at, b.collection_id,
            p.id, p.content, p.parent_post_id, coalesce(p.media_urls, '{}'::text[]) as media_urls,
            p.like_count, p.reply_count, p.repost_count, p.created_at, p.updated_at,
            p.edited_at, p.is_edited, p.status, p.scheduled_at,
            case when a.id is null then null else to_jsonb(a) end as author,
            (select jsonb_build_object('id', pl.id) from polls pl where pl.post_id = p.id limit 1) as poll
     from bookmarks b
     join posts p on p.id = b.post_id
     left join profiles a on a.id = p.author_id
     where b.user_id = $1::uuid
       and ($2::timestamptz is null or b.created_at < $2::timestamptz)
       and (
         $4 = 'all'
         or ($4 = 'unsorted' and b.collection_id is null)
         or ($4 = 'collection' and b.collection_id = $5::uuid)
       )
     order by b.created_at desc limit $3`,
    [userId, opts.cursor ?? null, opts.limit, opts.scope, opts.collectionId ?? null],
  );

  return rows.map((row) => {
    const { bookmark_id, bookmarked_at, collection_id, ...post } = row;
    return {
      ...post,
      feedKey: `bookmark-${String(bookmark_id)}`,
      bookmarked_at,
      bookmarkId: bookmark_id,
      collectionId: collection_id ?? null,
    } as Row;
  });
}

export async function listCollections(userId: string) {
  const collections = await q<{ id: string; name: string; created_at: string }>(
    `select id, name, created_at from bookmark_collections where user_id = $1::uuid order by created_at asc`,
    [userId],
  );
  const rows = await q<{ collection_id: string | null }>(
    `select collection_id from bookmarks where user_id = $1::uuid`,
    [userId],
  );

  const counts = new Map<string, number>();
  let unsorted = 0;
  for (const row of rows) {
    if (row.collection_id) counts.set(row.collection_id, (counts.get(row.collection_id) ?? 0) + 1);
    else unsorted += 1;
  }

  return {
    collections: collections.map((c) => ({ ...c, bookmarkCount: counts.get(c.id) ?? 0 })),
    totalCount: rows.length,
    unsortedCount: unsorted,
  };
}
