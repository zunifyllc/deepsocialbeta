import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createPublicClient } from "./supabase-public";
import { POST_WITH_AUTHOR } from "./feed-helpers";
import type { Post } from "./posts.functions";
import type { Profile } from "./profiles.functions";

/** Escapes ILIKE wildcards so user input is matched literally. */
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

const searchSchema = z.object({
  query: z.string().max(100).default(""),
  userLimit: z.number().min(1).max(50).default(5),
  postLimit: z.number().min(1).max(50).default(10),
  postOffset: z.number().min(0).max(500).default(0),
  sort: z.string().default("top"),
});

export interface SearchResults {
  users: Profile[];
  posts: Post[];
}

export const searchAll = createServerFn({ method: "GET" })
  .validator((input) => searchSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<SearchResults> => {
    const term = data.query.trim();
    if (!term) return { users: [], posts: [] };

    const pattern = `%${escapeLike(term)}%`;
    const supabase = createPublicClient();

    const usersQuery = supabase
      .from("profiles")
      .select("*")
      .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
      .limit(data.userLimit);

    let postsQuery = supabase
      .from("posts")
      .select(POST_WITH_AUTHOR)
      .ilike("content", pattern)
      .range(data.postOffset, data.postOffset + data.postLimit - 1);

    postsQuery =
      data.sort === "latest"
        ? postsQuery.order("created_at", { ascending: false })
        : postsQuery.order("like_count", { ascending: false }).order("created_at", { ascending: false });

    const [{ data: users, error: usersError }, { data: posts, error: postsError }] = await Promise.all([
      usersQuery,
      postsQuery,
    ]);
    if (usersError) throw usersError;
    if (postsError) throw postsError;

    return {
      users: (users ?? []) as unknown as Profile[],
      posts: (posts ?? []) as unknown as Post[],
    };
  });
