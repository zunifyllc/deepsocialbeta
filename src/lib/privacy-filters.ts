import type { Post } from "./posts.functions";

/** Drops feed items authored or reposted by muted/blocked accounts. */
export function filterVisiblePosts<T extends Post>(items: T[], hiddenIds: string[]): T[] {
  if (hiddenIds.length === 0) return items;
  const hidden = new Set(hiddenIds);
  return items.filter(
    (item) =>
      !(item.author && hidden.has(item.author.id)) &&
      !(item.repost?.repostedBy && hidden.has(item.repost.repostedBy.id)),
  );
}
