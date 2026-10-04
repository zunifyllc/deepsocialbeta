// Neon is the primary and only database for app data writes. Every write
// lives here; multi-table writes run inside one transaction.
// Auth stays on the old backend, so auth user ids are profiles.id.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PoolClient } from "@neondatabase/serverless";
import { withTransaction } from "@/lib/neon.server";
import { q, one, type Row } from "./core.server";
import { getPostById } from "./posts.server";
import { canEditPost } from "@/lib/post-edit-helpers";
import { hoursToInterval, isPollExpired } from "@/lib/poll-helpers";

type Tx = PoolClient;
const txq = async <T = Row>(tx: Tx, text: string, params: unknown[] = []) =>
  (await tx.query(text, params)).rows as T[];

// ------------------------------------------------------------ identity ---
const PROFILE_COLUMNS = [
  "id", "username", "display_name", "bio", "location", "website", "pronouns", "avatar_url",
  "banner_url", "is_verified", "accent_color", "theme_mode", "created_at", "updated_at",
];

/**
 * Makes sure the signed-in user has a Neon profile. Accounts are created by
 * the auth provider, which seeds the initial profile row on signup; that row
 * is copied into Neon once (same id), after which Neon owns it.
 */
export async function ensureActor(supabase: SupabaseClient, userId: string): Promise<void> {
  if (await one(`select 1 from profiles where id = $1::uuid`, [userId])) return;
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!data) throw new Error("Profile not found");
  const row = data as Row;
  const cols = PROFILE_COLUMNS.filter((c) => row[c] !== undefined);
  await q(
    `insert into profiles (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})
     on conflict (id) do nothing`,
    cols.map((c) => row[c]),
  );
}

async function postAuthor(postId: string) {
  return (await one<{ author_id: string; parent_post_id: string | null }>(
    `select author_id, parent_post_id from posts where id = $1::uuid`,
    [postId],
  ));
}

async function notify(tx: Tx, userId: string, actorId: string, type: string, postId: string | null) {
  if (userId === actorId) return;
  await txq(tx, `insert into notifications (user_id, actor_id, type, post_id) values ($1, $2, $3, $4)`, [
    userId, actorId, type, postId,
  ]);
}

// --------------------------------------------------------------- posts ---
export async function createPost(
  userId: string,
  data: {
    content: string;
    parentPostId?: string | undefined;
    mediaUrls: string[];
    poll?: { options: string[]; durationHours: number | null } | undefined;
    scheduledAt?: string | null | undefined;
  },
) {
  const id = await withTransaction(async (tx) => {
    const scheduled = !!data.scheduledAt;
    const [post] = await txq<{ id: string }>(
      tx,
      `insert into posts (author_id, content, parent_post_id, media_urls, status, scheduled_at, created_at)
       values ($1, $2, $3, $4, $5, $6, coalesce($7::timestamptz, now())) returning id`,
      [userId, data.content, data.parentPostId ?? null, data.mediaUrls, scheduled ? "scheduled" : "published",
        data.scheduledAt ?? null, data.scheduledAt ?? null],
    );
    if (data.parentPostId) {
      await txq(tx, `update posts set reply_count = reply_count + 1 where id = $1`, [data.parentPostId]);
      const parent = await txq<{ author_id: string }>(tx, `select author_id from posts where id = $1`, [data.parentPostId]);
      if (parent[0]) await notify(tx, parent[0].author_id, userId, "reply", post!.id);
    }
    if (data.poll) {
      const [poll] = await txq<{ id: string }>(
        tx,
        `insert into polls (post_id, duration) values ($1, $2::interval) returning id`,
        [post!.id, hoursToInterval(data.poll.durationHours)],
      );
      for (const [index, content] of data.poll.options.entries()) {
        await txq(tx, `insert into poll_options (poll_id, content, position) values ($1, $2, $3)`, [
          poll!.id, content, index + 1,
        ]);
      }
    }
    return post!.id;
  });
  return getPostById(id);
}

export async function editPost(userId: string, postId: string, content: string) {
  const existing = await one<{ author_id: string; created_at: string }>(
    `select author_id, created_at from posts where id = $1::uuid`,
    [postId],
  );
  if (!existing || existing.author_id !== userId) throw new Error("You can only edit your own posts");
  if (!canEditPost(existing.created_at)) throw new Error("Editing window has expired");
  await q(
    `update posts set content = $3, edited_at = now(), is_edited = true where id = $1::uuid and author_id = $2::uuid`,
    [postId, userId, content],
  );
  return getPostById(postId);
}

export async function deletePost(userId: string, postId: string) {
  await withTransaction(async (tx) => {
    const rows = await txq<{ parent_post_id: string | null }>(
      tx,
      `delete from posts where id = $1 and author_id = $2 returning parent_post_id`,
      [postId, userId],
    );
    const parent = rows[0]?.parent_post_id;
    if (parent) {
      await txq(tx, `update posts set reply_count = greatest(reply_count - 1, 0) where id = $1`, [parent]);
    }
  });
}

export async function requireOwnScheduledPost(userId: string, postId: string) {
  const post = await one<{ author_id: string; status: string }>(
    `select author_id, status from posts where id = $1::uuid`,
    [postId],
  );
  if (!post || post.author_id !== userId) throw new Error("You can only manage your own posts");
  if (post.status !== "scheduled") throw new Error("This post is already published");
}

export async function publishNow(userId: string, postId: string) {
  await requireOwnScheduledPost(userId, postId);
  await q(
    `update posts set status = 'published', scheduled_at = null, created_at = now() where id = $1::uuid and author_id = $2::uuid`,
    [postId, userId],
  );
}

export async function cancelScheduledPost(userId: string, postId: string) {
  await requireOwnScheduledPost(userId, postId);
  await q(`delete from posts where id = $1::uuid and author_id = $2::uuid`, [postId, userId]);
}

export async function updateScheduledPost(
  userId: string,
  postId: string,
  patch: { content?: string | undefined; mediaUrls?: string[] | undefined; scheduledAt?: string | undefined },
) {
  await requireOwnScheduledPost(userId, postId);
  await q(
    `update posts set
       content = coalesce($3, content),
       media_urls = case when $4::boolean then $5::text[] else media_urls end,
       scheduled_at = coalesce($6::timestamptz, scheduled_at),
       created_at = coalesce($6::timestamptz, created_at)
     where id = $1::uuid and author_id = $2::uuid`,
    [postId, userId, patch.content ?? null, patch.mediaUrls !== undefined, patch.mediaUrls ?? null, patch.scheduledAt ?? null],
  );
  return getPostById(postId);
}

/** Publishes every scheduled post whose time has come. Returns how many. */
export async function publishScheduledPosts(): Promise<number> {
  const before = await one<{ c: number }>(
    `select count(*)::int as c from posts where status = 'scheduled' and scheduled_at <= now()`,
  );
  await q(`select public.publish_scheduled_posts()`);
  return before?.c ?? 0;
}

// ---------------------------------------------------------- engagement ---
export async function toggleLike(userId: string, postId: string) {
  return withTransaction(async (tx) => {
    const removed = await txq(tx, `delete from likes where post_id = $1 and user_id = $2 returning id`, [postId, userId]);
    if (removed.length) {
      await txq(tx, `update posts set like_count = greatest(like_count - 1, 0) where id = $1`, [postId]);
      return { liked: false };
    }
    await txq(tx, `insert into likes (post_id, user_id) values ($1, $2)`, [postId, userId]);
    const [post] = await txq<{ author_id: string }>(
      tx,
      `update posts set like_count = like_count + 1 where id = $1 returning author_id`,
      [postId],
    );
    if (post) await notify(tx, post.author_id, userId, "like", postId);
    return { liked: true };
  });
}

export async function toggleFollow(userId: string, followingId: string) {
  return withTransaction(async (tx) => {
    const removed = await txq(tx, `delete from follows where follower_id = $1 and following_id = $2 returning id`, [
      userId, followingId,
    ]);
    if (removed.length) return { following: false };
    await txq(tx, `insert into follows (follower_id, following_id) values ($1, $2)`, [userId, followingId]);
    await notify(tx, followingId, userId, "follow", null);
    return { following: true };
  });
}

/** Repost counts are kept by the reposts trigger. */
export async function toggleRepost(userId: string, postId: string, quote: string | undefined) {
  return withTransaction(async (tx) => {
    const removed = await txq(tx, `delete from reposts where post_id = $1 and user_id = $2 returning id`, [postId, userId]);
    if (removed.length && !quote) return { isReposted: false };
    await txq(tx, `insert into reposts (post_id, user_id, quote_content) values ($1, $2, $3)`, [
      postId, userId, quote ?? null,
    ]);
    const [post] = await txq<{ author_id: string }>(tx, `select author_id from posts where id = $1`, [postId]);
    if (post) await notify(tx, post.author_id, userId, "repost", postId);
    return { isReposted: true };
  });
}

export { postAuthor };

// ----------------------------------------------------------- bookmarks ---
export async function toggleBookmark(userId: string, postId: string) {
  const removed = await q(`delete from bookmarks where post_id = $1::uuid and user_id = $2::uuid returning id`, [postId, userId]);
  if (removed.length) return { isBookmarked: false };
  await q(`insert into bookmarks (post_id, user_id) values ($1::uuid, $2::uuid)`, [postId, userId]);
  return { isBookmarked: true };
}

export async function createCollection(userId: string, name: string) {
  try {
    const row = await one<{ id: string; name: string; created_at: string }>(
      `insert into bookmark_collections (user_id, name) values ($1::uuid, $2) returning id, name, created_at`,
      [userId, name],
    );
    return row!;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new Error("You already have a collection with that name");
    throw error;
  }
}

export async function deleteCollection(userId: string, collectionId: string) {
  await q(`delete from bookmark_collections where id = $1::uuid and user_id = $2::uuid`, [collectionId, userId]);
}

export async function moveBookmark(userId: string, bookmarkId: string, collectionId: string | null) {
  if (collectionId) {
    const owned = await one(`select 1 from bookmark_collections where id = $1::uuid and user_id = $2::uuid`, [collectionId, userId]);
    if (!owned) throw new Error("Collection not found");
  }
  await q(`update bookmarks set collection_id = $3::uuid where id = $1::uuid and user_id = $2::uuid`, [
    bookmarkId, userId, collectionId,
  ]);
}

// ------------------------------------------------------------ profiles ---
const PROFILE_EDITABLE = [
  "display_name", "bio", "location", "website", "pronouns", "avatar_url", "banner_url", "accent_color", "theme_mode",
];

export async function updateProfile(userId: string, update: Record<string, string | null>) {
  const cols = Object.keys(update).filter((c) => PROFILE_EDITABLE.includes(c));
  if (cols.length === 0) return one(`select * from profiles where id = $1::uuid`, [userId]);
  return one(
    `update profiles set ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")} where id = $1::uuid returning *`,
    [userId, ...cols.map((c) => update[c])],
  );
}

export async function togglePinPost(userId: string, postId: string) {
  const post = await postAuthor(postId);
  if (!post || post.author_id !== userId) throw new Error("You can only pin your own posts");
  return one(
    `update profiles set pinned_post_id = case when pinned_post_id = $2::uuid then null else $2::uuid end
     where id = $1::uuid returning *`,
    [userId, postId],
  );
}

export async function setVerified(userId: string, value: boolean) {
  const row = await one(
    `update profiles set is_verified = $2 where id = $1::uuid
     returning id, username, display_name, avatar_url, is_verified, created_at`,
    [userId, value],
  );
  if (!row) throw new Error("User not found");
  return row;
}

// ------------------------------------------------------- notifications ---
export async function markNotificationsRead(userId: string, ids: string[] | null) {
  await q(
    `update notifications set read_at = now()
     where user_id = $1::uuid and read_at is null and ($2::uuid[] is null or id = any($2::uuid[]))`,
    [userId, ids],
  );
}

const SETTINGS_COLS = "user_id, email_likes, email_replies, email_follows, email_reposts";

export async function getOrCreateNotificationSettings(userId: string) {
  await q(`insert into notification_settings (user_id) values ($1::uuid) on conflict (user_id) do nothing`, [userId]);
  return one(`select ${SETTINGS_COLS} from notification_settings where user_id = $1::uuid`, [userId]);
}

export async function upsertNotificationSettings(
  userId: string,
  s: { email_likes: boolean; email_replies: boolean; email_follows: boolean; email_reposts: boolean },
) {
  return one(
    `insert into notification_settings (user_id, email_likes, email_replies, email_follows, email_reposts)
     values ($1::uuid, $2, $3, $4, $5)
     on conflict (user_id) do update set email_likes = excluded.email_likes, email_replies = excluded.email_replies,
       email_follows = excluded.email_follows, email_reposts = excluded.email_reposts
     returning ${SETTINGS_COLS}`,
    [userId, s.email_likes, s.email_replies, s.email_follows, s.email_reposts],
  );
}

// ------------------------------------------------------------ messages ---
export async function getOrCreateConversation(userId: string, targetId: string) {
  const row = await one<{ id: string }>(`select public.get_or_create_conversation($1::uuid, $2::uuid) as id`, [userId, targetId]);
  return row!.id;
}

export async function sendMessage(userId: string, conversationId: string, content: string) {
  const member = await one(`select 1 from conversations where id = $1::uuid and $2::uuid = any(participants)`, [
    conversationId, userId,
  ]);
  if (!member) throw new Error("Conversation not found");
  return one(
    `with m as (insert into messages (conversation_id, sender_id, content) values ($1::uuid, $2::uuid, $3) returning *)
     select m.id, m.conversation_id, m.sender_id, m.content, m.created_at,
       jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name,
         'avatar_url', p.avatar_url, 'is_verified', p.is_verified) as sender
     from m join profiles p on p.id = m.sender_id`,
    [conversationId, userId, content],
  );
}

// --------------------------------------------------------------- polls ---
export async function createPoll(userId: string, postId: string, options: string[], durationHours: number | null) {
  const post = await postAuthor(postId);
  if (!post || post.author_id !== userId) throw new Error("Post not found");
  return withTransaction(async (tx) => {
    const [poll] = await txq<{ id: string }>(tx, `insert into polls (post_id, duration) values ($1, $2::interval) returning id`, [
      postId, hoursToInterval(durationHours),
    ]);
    for (const [index, content] of options.entries()) {
      await txq(tx, `insert into poll_options (poll_id, content, position) values ($1, $2, $3)`, [poll!.id, content, index + 1]);
    }
    return poll!.id;
  });
}

export async function deletePoll(userId: string, pollId: string) {
  await q(
    `delete from polls pl using posts p where pl.id = $1::uuid and p.id = pl.post_id and p.author_id = $2::uuid`,
    [pollId, userId],
  );
}

export async function votePoll(userId: string, pollId: string, optionId: string) {
  const poll = await one<{ created_at: string; duration: string | null; post_id: string }>(
    `select created_at, duration::text as duration, post_id from polls where id = $1::uuid`,
    [pollId],
  );
  if (!poll) throw new Error("Poll not found");
  if (isPollExpired(poll.created_at, poll.duration)) throw new Error("This poll has closed");
  const option = await one(`select 1 from poll_options where id = $1::uuid and poll_id = $2::uuid`, [optionId, pollId]);
  if (!option) throw new Error("Invalid poll option");
  await withTransaction(async (tx) => {
    const existing = await txq<{ id: string; option_id: string }>(
      tx,
      `select id, option_id from poll_votes where poll_id = $1 and user_id = $2`,
      [pollId, userId],
    );
    if (existing[0]) {
      if (existing[0].option_id !== optionId) {
        await txq(tx, `update poll_votes set option_id = $2 where id = $1`, [existing[0].id, optionId]);
      }
      return;
    }
    await txq(tx, `insert into poll_votes (poll_id, option_id, user_id) values ($1, $2, $3)`, [pollId, optionId, userId]);
    const [post] = await txq<{ author_id: string }>(tx, `select author_id from posts where id = $1`, [poll.post_id]);
    if (post) await notify(tx, post.author_id, userId, "poll_vote", poll.post_id);
  });
}

// --------------------------------------------------------------- lists ---
const LIST_RETURN = "id, creator_id, name, description, is_public, created_at, updated_at";

export async function createList(userId: string, name: string, description: string | null, isPublic: boolean) {
  return one(
    `insert into lists (creator_id, name, description, is_public) values ($1::uuid, $2, $3, $4) returning ${LIST_RETURN}`,
    [userId, name, description, isPublic],
  );
}

export async function updateList(
  userId: string,
  listId: string,
  patch: { name?: string; description?: string | null; is_public?: boolean },
) {
  const row = await one(
    `update lists set name = coalesce($3, name),
       description = case when $4::boolean then $5 else description end,
       is_public = coalesce($6, is_public)
     where id = $1::uuid and creator_id = $2::uuid returning ${LIST_RETURN}`,
    [listId, userId, patch.name ?? null, "description" in patch, patch.description ?? null, patch.is_public ?? null],
  );
  if (!row) throw new Error("List not found");
  return row;
}

export async function deleteList(userId: string, listId: string) {
  await q(`delete from lists where id = $1::uuid and creator_id = $2::uuid`, [listId, userId]);
}

async function assertListOwner(userId: string, listId: string) {
  const own = await one(`select 1 from lists where id = $1::uuid and creator_id = $2::uuid`, [listId, userId]);
  if (!own) throw new Error("List not found");
}

export async function addListMember(userId: string, listId: string, memberId: string) {
  await assertListOwner(userId, listId);
  await q(`insert into list_members (list_id, user_id) values ($1::uuid, $2::uuid) on conflict (list_id, user_id) do nothing`, [
    listId, memberId,
  ]);
}

export async function removeListMember(userId: string, listId: string, memberId: string) {
  await assertListOwner(userId, listId);
  await q(`delete from list_members where list_id = $1::uuid and user_id = $2::uuid`, [listId, memberId]);
}

// ----------------------------------------------------------- analytics ---
export async function recordImpression(userId: string, postId: string) {
  const post = await postAuthor(postId);
  if (!post || post.author_id === userId) return { recorded: false };
  try {
    await q(`insert into post_impressions (post_id, user_id) values ($1::uuid, $2::uuid)`, [postId, userId]);
    return { recorded: true };
  } catch {
    return { recorded: false };
  }
}

export async function recordVisit(userId: string, profileId: string) {
  if (profileId === userId) return { recorded: false };
  try {
    await q(`insert into profile_visits (profile_id, visitor_id) values ($1::uuid, $2::uuid)`, [profileId, userId]);
    return { recorded: true };
  } catch {
    return { recorded: false };
  }
}

// ------------------------------------------------------------- privacy ---
export async function toggleMute(userId: string, targetId: string) {
  const removed = await q(`delete from muted_users where muted_by = $1::uuid and muted_user_id = $2::uuid returning id`, [userId, targetId]);
  if (removed.length) return { isMuted: false };
  await q(`insert into muted_users (muted_by, muted_user_id) values ($1::uuid, $2::uuid)`, [userId, targetId]);
  return { isMuted: true };
}

/** Hard block: severs follows, likes, reposts and notifications both ways. */
export async function toggleBlock(me: string, them: string) {
  return withTransaction(async (tx) => {
    const removed = await txq(tx, `delete from blocked_users where blocked_by = $1 and blocked_user_id = $2 returning id`, [me, them]);
    if (removed.length) return { isBlocked: false };
    await txq(tx, `insert into blocked_users (blocked_by, blocked_user_id) values ($1, $2)`, [me, them]);
    await txq(
      tx,
      `delete from follows where (follower_id = $1 and following_id = $2) or (follower_id = $2 and following_id = $1)`,
      [me, them],
    );
    const liked = await txq<{ post_id: string }>(
      tx,
      `delete from likes l using posts p where p.id = l.post_id
         and ((p.author_id = $1 and l.user_id = $2) or (p.author_id = $2 and l.user_id = $1))
       returning l.post_id`,
      [me, them],
    );
    for (const { post_id } of liked) {
      await txq(tx, `update posts set like_count = greatest(like_count - 1, 0) where id = $1`, [post_id]);
    }
    await txq(
      tx,
      `delete from reposts r using posts p where p.id = r.post_id
         and ((p.author_id = $1 and r.user_id = $2) or (p.author_id = $2 and r.user_id = $1))`,
      [me, them],
    );
    await txq(
      tx,
      `delete from notifications where (user_id = $1 and actor_id = $2) or (user_id = $2 and actor_id = $1)`,
      [me, them],
    );
    return { isBlocked: true };
  });
}
