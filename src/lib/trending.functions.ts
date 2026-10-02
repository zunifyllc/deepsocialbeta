import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Post } from "./posts.functions";

export interface TrendingHashtag {
  hashtag: string;
  post_count: number;
}

const trendingSchema = z.object({
  limit: z.number().min(1).max(50).default(10),
});

export const getTrendingHashtags = createServerFn({ method: "GET" })
  .validator((input) => trendingSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<TrendingHashtag[]> => {
    const { trendingHashtags } = await import("./neon/features.server");
    const rows = await trendingHashtags(data.limit);
    return rows.map((row) => ({
      hashtag: row.hashtag,
      post_count: Number(row.post_count),
    }));
  });

const hashtagSchema = z.object({
  hashtag: z.string().max(60).default(""),
  limit: z.number().min(1).max(50).default(30),
  offset: z.number().min(0).max(500).default(0),
});

export const getHashtagPosts = createServerFn({ method: "GET" })
  .validator((input) => hashtagSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<Post[]> => {
    const tag = data.hashtag.trim().replace(/^#/, "");
    if (!tag) return [];

    const { hashtagPosts } = await import("./neon/features.server");
    const posts = await hashtagPosts(tag, data.limit, data.offset);
    return (posts ?? []) as unknown as Post[];
  });
