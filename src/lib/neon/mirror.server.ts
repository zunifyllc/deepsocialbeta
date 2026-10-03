// Write mirroring: Supabase stays the authoritative writer during the
// migration (so features still on Supabase keep valid foreign keys), and every
// migrated write is replicated into Neon straight away, which is where the
// migrated reads come from.
//
// Mirror failures never break a user action — they are logged and swallowed.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { q, removeById, upsert, type MirrorTable, type Row } from "./core.server";
import { hasNeonDatabase } from "@/lib/neon.server";

type Client = SupabaseClient<Database>;

/** Runs a mirror write, logging (never throwing) on failure. */
export async function safeMirror(label: string, fn: () => Promise<void>): Promise<void> {
  if (!hasNeonDatabase()) return;
  try {
    await fn();
  } catch (error) {
    console.error(`[neon-mirror] ${label} failed:`, error);
  }
}

async function copyRow(
  supabase: Client,
  table: MirrorTable,
  id: string,
  column = "id",
): Promise<Row | null> {
  const { data } = await supabase.from(table).select("*").eq(column, id).maybeSingle();
  if (!data) return null;
  await upsert(table, data as Row);
  return data as Row;
}

/** Neon has no auth schema, so profiles are the identity anchor: copy first. */
export async function ensureProfile(supabase: Client, userId: string): Promise<void> {
  await copyRow(supabase, "profiles", userId);
}

/** Copies a post (and its author, plus the parent chain) into Neon. */
export async function ensurePost(supabase: Client, postId: string): Promise<void> {
  const { data: post } = await supabase.from("posts").select("*").eq("id", postId).maybeSingle();
  if (!post) return;
  await ensureProfile(supabase, post.author_id);
  if (post.parent_post_id) await ensurePost(supabase, post.parent_post_id);
  await upsert("posts", post as Row);
}

export async function mirrorProfile(supabase: Client, userId: string) {
  await safeMirror("profile", () => ensureProfile(supabase, userId));
}

export async function mirrorPost(supabase: Client, postId: string) {
  await safeMirror("post", () => ensurePost(supabase, postId));
}

export async function mirrorPostDelete(postId: string) {
  await safeMirror("post-delete", () => removeById("posts", postId));
}

/** Re-reads engagement counters from Supabase so Neon stays in step. */
export async function syncPostCounters(supabase: Client, postId: string) {
  await safeMirror("counters", async () => {
    const { data } = await supabase
      .from("posts")
      .select("id, like_count, reply_count, repost_count")
      .eq("id", postId)
      .maybeSingle();
    if (!data) return;
    await q(
      `update posts set like_count = $2, reply_count = $3, repost_count = $4 where id = $1::uuid`,
      [data.id, data.like_count, data.reply_count, data.repost_count],
    );
  });
}

/** Mirrors a row that was just written in Supabase, ensuring its dependencies. */
export async function mirrorRow(
  supabase: Client,
  table: MirrorTable,
  row: Row,
  deps: { userId?: string; postId?: string } = {},
) {
  await safeMirror(table, async () => {
    if (deps.userId) await ensureProfile(supabase, deps.userId);
    if (deps.postId) await ensurePost(supabase, deps.postId);
    await upsert(table, row);
  });
}

export async function mirrorRowDelete(table: MirrorTable, id: string) {
  await safeMirror(`${table}-delete`, () => removeById(table, id));
}

/** Mirrors a bookmark's collection move. */
export async function mirrorBookmarkCollection(
  bookmarkId: string,
  userId: string,
  collectionId: string | null,
) {
  await safeMirror("bookmark-move", async () => {
    await q(
      `update bookmarks set collection_id = $3::uuid where id = $1::uuid and user_id = $2::uuid`,
      [bookmarkId, userId, collectionId],
    );
  });
}

const PROFILE_REFS = [
  "user_id", "actor_id", "sender_id", "creator_id", "muted_by", "muted_user_id",
  "blocked_by", "blocked_user_id", "visitor_id", "profile_id", "follower_id", "following_id",
];

/**
 * Replaces every Neon row in `table` where `column = value` with the current
 * Supabase rows (read with elevated access so other users' rows are included).
 * Copies referenced profiles/posts first so foreign keys hold. Best-effort.
 */
export async function resyncScope(table: MirrorTable, column: string, value: string) {
  await safeMirror(`resync-${table}`, async () => {
    if (!/^[a-z_]+$/.test(column)) throw new Error("bad column");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Client;
    const { data, error } = await (admin.from(table) as unknown as {
      select: (c: string) => { eq: (c: string, v: string) => Promise<{ data: Row[] | null; error: unknown }> };
    })
      .select("*")
      .eq(column, value);
    if (error) throw error;
    const rows = data ?? [];
    for (const row of rows) {
      for (const ref of PROFILE_REFS) {
        if (typeof row[ref] === "string") await ensureProfile(admin, row[ref] as string);
      }
      if (typeof row["post_id"] === "string") await ensurePost(admin, row["post_id"]);
    }
    await q(`delete from ${table} where ${column} = $1::uuid`, [value]);
    const conflict = table === "notification_settings" ? "user_id" : "id";
    for (const row of rows) await upsert(table, row, conflict);
  });
}

/** Copies a post's poll and its options. */
export async function mirrorPollForPost(postId: string) {
  await resyncScope("polls", "post_id", postId);
  await safeMirror("poll-options", async () => {
    const polls = await q<{ id: string }>(`select id from polls where post_id = $1::uuid`, [postId]);
    for (const poll of polls) await resyncScope("poll_options", "poll_id", poll.id);
  });
}

/** Recomputes like/repost counters in Neon for posts by the given authors. */
export async function recountForAuthors(authorIds: string[]) {
  await safeMirror("recount", async () => {
    await q(
      `update posts set
         like_count = (select count(*) from likes l where l.post_id = posts.id),
         repost_count = (select count(*) from reposts r where r.post_id = posts.id)
       where author_id = any($1::uuid[])`,
      [authorIds],
    );
  });
}
