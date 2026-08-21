import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Scheduled posts must be at least this far in the future. */
export const MIN_SCHEDULE_LEAD_MS = 5 * 60 * 1000;

export function isValidScheduleTime(scheduledAt: string, now: number = Date.now()): boolean {
  const time = new Date(scheduledAt).getTime();
  return Number.isFinite(time) && time - now >= MIN_SCHEDULE_LEAD_MS;
}

export function assertFutureSchedule(scheduledAt: string) {
  if (!isValidScheduleTime(scheduledAt)) {
    throw new Error("Pick a time at least 5 minutes from now");
  }
}

/** Throws unless the post exists, belongs to the user, and is still scheduled. */
export async function requireOwnScheduledPost(
  supabase: SupabaseClient<Database>,
  postId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("posts")
    .select("id, author_id, status")
    .eq("id", postId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.author_id !== userId) throw new Error("You can only manage your own posts");
  if (data.status !== "scheduled") throw new Error("This post is already published");
}

/** Converts a `datetime-local` value (local time) to a UTC ISO string. */
export function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}

/** Converts a UTC ISO string to a `datetime-local` input value. */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatScheduleTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
