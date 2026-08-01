import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

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

export const hoursToInterval = (hours: number | null) => (hours === null ? null : `${hours} hours`);

/** Parses the Postgres interval shapes we store ("24:00:00", "3 days", "1 mon"). */
export function intervalToMs(duration: string): number {
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

export function endsAtMs(createdAt: string, duration: string) {
  return new Date(createdAt).getTime() + intervalToMs(duration);
}

export function isPollExpired(createdAt: string, duration: string | null) {
  if (!duration) return false;
  return Date.now() > endsAtMs(createdAt, duration);
}

type Client = SupabaseClient<Database>;

/** Aggregates a poll's options and votes into display-ready results. */
export async function readPollResults(
  supabase: Client,
  pollId: string,
  userId: string | null,
): Promise<PollResults> {
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

  const voteRows = votes ?? [];
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
    options: (options ?? []).map((option) => ({
      id: option.id,
      content: option.content,
      position: option.position,
      voteCount: counts.get(option.id) ?? 0,
    })),
  };
}
