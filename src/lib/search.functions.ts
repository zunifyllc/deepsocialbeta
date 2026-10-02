import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Post } from "./posts.functions";
import type { Profile } from "./profiles.functions";

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

    const { getViewerHiddenAuthorIds } = await import("./privacy-helpers.server");
    const { searchUsers, searchPosts } = await import("./neon/features.server");
    const hidden = await getViewerHiddenAuthorIds();
    const [users, posts] = await Promise.all([
      searchUsers(term, hidden, data.userLimit),
      searchPosts(term, hidden, data.sort, data.postLimit, data.postOffset),
    ]);

    return {
      users: (users ?? []) as unknown as Profile[],
      posts: (posts ?? []) as unknown as Post[],
    };
  });
