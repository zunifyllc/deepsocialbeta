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
