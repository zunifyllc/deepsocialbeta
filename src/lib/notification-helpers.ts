export interface RawNotificationActor {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface RawNotification {
  id: string;
  type: "like" | "reply" | "follow" | "repost" | "poll_vote";
  read_at: string | null;
  created_at: string;
  post_id: string | null;
  actor: RawNotificationActor | null;
  post: { id: string; content: string } | null;
}

export interface GroupedNotification {
  key: string;
  type: RawNotification["type"];
  ids: string[];
  actors: RawNotificationActor[];
  actorCount: number;
  post: { id: string; content: string } | null;
  post_id: string | null;
  created_at: string;
  unread: boolean;
}

const ONE_HOUR = 60 * 60 * 1000;

/** Groups notifications of the same type/post whose timestamps are within one hour. */
export function groupNotifications(rows: RawNotification[]): GroupedNotification[] {
  const groups: GroupedNotification[] = [];

  for (const row of rows) {
    const rowTime = new Date(row.created_at).getTime();
    const existing = groups.find(
      (g) =>
        g.type === row.type &&
        g.post_id === row.post_id &&
        Math.abs(new Date(g.created_at).getTime() - rowTime) <= ONE_HOUR,
    );

    if (existing) {
      existing.ids.push(row.id);
      existing.actorCount += 1;
      if (row.actor && !existing.actors.some((a) => a.id === row.actor!.id)) {
        existing.actors.push(row.actor);
      }
      if (!row.read_at) existing.unread = true;
      continue;
    }

    groups.push({
      key: `${row.type}:${row.post_id ?? "none"}:${row.id}`,
      type: row.type,
      ids: [row.id],
      actors: row.actor ? [row.actor] : [],
      actorCount: 1,
      post: row.post,
      post_id: row.post_id,
      created_at: row.created_at,
      unread: !row.read_at,
    });
  }

  return groups;
}

const VERB: Record<RawNotification["type"], string> = {
  like: "liked your post",
  reply: "replied to your post",
  follow: "followed you",
  repost: "reposted your post",
  poll_vote: "voted in your poll",
};

export function groupSummary(group: GroupedNotification): { names: string; verb: string } {
  const names = group.actors.map((a) => a.display_name ?? a.username);
  const first = names[0] ?? "Someone";
  const others = Math.max(group.actorCount - 1, 0);

  let label = first;
  if (others === 1 && names[1]) label = `${first} and ${names[1]}`;
  else if (others >= 1) label = `${first} and ${others} others`;

  return { names: label, verb: VERB[group.type] };
}
