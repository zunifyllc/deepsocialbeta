import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createPublicClient } from "./supabase-public";

export interface PollOptionResult {
  id: string;
  content: string;
  position: number;
  voteCount: number;
}

export interface PollResults {
  pollId: string;
  postId: string;
  createdAt: string;
  endsAt: string | null;
  expired: boolean;
  totalVotes: number;
  userVotedOptionId: string | null;
  options: PollOptionResult[];
}

/** Allowed poll lifetimes, in hours. `null` means the poll never closes. */
export const POLL_DURATIONS = [
  { label: "1 day", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
  { label: "No expiry", hours: null },
] as const;

export const pollInputSchema = z.object({
  options: z.array(z.string().trim().min(1).max(80)).min(2).max(4),
  durationHours: z.number().int().min(1).max(720).nullable().default(24),
});

export type PollInput = z.infer<typeof pollInputSchema>;

const hoursToInterval = (hours: number | null) => (hours === null ? null : `${hours} hours`);

export const createPoll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ postId: z.string().uuid() }).merge(pollInputSchema).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: post, error: postError } = await context.supabase
      .from("posts")
      .select("id, author_id")
      .eq("id", data.postId)
      .maybeSingle();
    if (postError) throw postError;
    if (!post || post.author_id !== context.userId) throw new Error("Post not found");

    const { data: poll, error } = await context.supabase
      .from("polls")
      .insert({ post_id: data.postId, duration: hoursToInterval(data.durationHours) })
      .select("id")
      .single();
    if (error) throw error;

    const { error: optionsError } = await context.supabase.from("poll_options").insert(
      data.options.map((content, index) => ({
        poll_id: poll.id,
        content,
        position: index + 1,
      })),
    );
    if (optionsError) throw optionsError;

    return { pollId: poll.id };
  });

export const deletePoll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ pollId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("polls").delete().eq("id", data.pollId);
    if (error) throw error;
    return { success: true };
  });

export const votePoll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ pollId: z.string().uuid(), optionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: poll, error: pollError } = await context.supabase
      .from("polls")
      .select("id, created_at, duration, post_id")
      .eq("id", data.pollId)
      .maybeSingle();
    if (pollError) throw pollError;
    if (!poll) throw new Error("Poll not found");
    if (isExpired(poll.created_at, poll.duration)) throw new Error("This poll has closed");

    const { data: option, error: optionError } = await context.supabase
      .from("poll_options")
      .select("id")
      .eq("id", data.optionId)
      .eq("poll_id", data.pollId)
      .maybeSingle();
    if (optionError) throw optionError;
    if (!option) throw new Error("Invalid poll option");

    const { data: existing } = await context.supabase
      .from("poll_votes")
      .select("id, option_id")
      .eq("poll_id", data.pollId)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (existing) {
      if (existing.option_id !== data.optionId) {
        const { error } = await context.supabase
          .from("poll_votes")
          .update({ option_id: data.optionId })
          .eq("id", existing.id);
        if (error) throw error;
      }
    } else {
      const { error } = await context.supabase.from("poll_votes").insert({
        poll_id: data.pollId,
        option_id: data.optionId,
        user_id: context.userId,
      });
      if (error) throw error;

      const { data: post } = await context.supabase
        .from("posts")
        .select("author_id")
        .eq("id", poll.post_id)
        .maybeSingle();
      if (post && post.author_id !== context.userId) {
        await context.supabase.from("notifications").insert({
          user_id: post.author_id,
          actor_id: context.userId,
          type: "poll_vote",
          post_id: poll.post_id,
        });
      }
    }

    return readResults(context.supabase, data.pollId, context.userId);
  });

export const getPollResults = createServerFn({ method: "GET" })
  .validator((input) =>
    z
      .object({ pollId: z.string().uuid(), userId: z.string().uuid().optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const supabase = createPublicClient();
    return readResults(supabase, data.pollId, data.userId ?? null);
  });

function isExpired(createdAt: string, duration: string | null) {
  if (!duration) return false;
  return Date.now() > endsAtMs(createdAt, duration);
}

/** Parses the Postgres interval shapes we store ("24:00:00", "3 days", "1 mon"). */
function intervalToMs(duration: string): number {
  let ms = 0;
  const dayMatch = duration.match(/(-?\d+)\s+day/);
  if (dayMatch) ms += Number(dayMatch[1]) * 86_400_000;
  const monMatch = duration.match(/(-?\d+)\s+mon/);
  if (monMatch) ms += Number(monMatch[1]) * 30 * 86_400_000;
  const timeMatch = duration.match(/(\d+):(\d{2}):(\d{2})/);
  if (timeMatch) {
    ms +=
      Number(timeMatch[1]) * 3_600_000 + Number(timeMatch[2]) * 60_000 + Number(timeMatch[3]) * 1000;
  }
  const hourMatch = duration.match(/(-?\d+)\s+hour/);
  if (!timeMatch && hourMatch) ms += Number(hourMatch[1]) * 3_600_000;
  return ms;
}

function endsAtMs(createdAt: string, duration: string) {
  return new Date(createdAt).getTime() + intervalToMs(duration);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function readResults(supabase: any, pollId: string, userId: string | null): Promise<PollResults> {
  const { data: poll, error } = await supabase
    .from("polls")
    .select("id, post_id, created_at, duration")
    .eq("id", pollId)
    .maybeSingle();
  if (error) throw error;
  if (!poll) throw new Error("Poll not found");

  const { data: options, error: optionsError } = await supabase
    .from("poll_options")
    .select("id, content, position")
    .eq("poll_id", pollId)
    .order("position", { ascending: true });
  if (optionsError) throw optionsError;

  const { data: votes, error: votesError } = await supabase
    .from("poll_votes")
    .select("option_id, user_id")
    .eq("poll_id", pollId);
  if (votesError) throw votesError;

  const voteRows = (votes ?? []) as { option_id: string; user_id: string }[];
  const counts = new Map<string, number>();
  for (const vote of voteRows) counts.set(vote.option_id, (counts.get(vote.option_id) ?? 0) + 1);

  const endsAt = poll.duration ? new Date(endsAtMs(poll.created_at, poll.duration)).toISOString() : null;

  return {
    pollId: poll.id,
    postId: poll.post_id,
    createdAt: poll.created_at,
    endsAt,
    expired: endsAt ? Date.now() > new Date(endsAt).getTime() : false,
    totalVotes: voteRows.length,
    userVotedOptionId: userId
      ? voteRows.find((vote) => vote.user_id === userId)?.option_id ?? null
      : null,
    options: ((options ?? []) as { id: string; content: string; position: number }[]).map((option) => ({
      id: option.id,
      content: option.content,
      position: option.position,
      voteCount: counts.get(option.id) ?? 0,
    })),
  };
}
