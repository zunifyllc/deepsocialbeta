import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createPublicClient } from "./supabase-public";
import { hoursToInterval, isPollExpired, pollInputSchema, readPollResults } from "./poll-helpers";

export const createPoll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ postId: z.string().uuid() }).merge(pollInputSchema).parse(input))
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
    if (isPollExpired(poll.created_at, poll.duration)) throw new Error("This poll has closed");

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
      await (await import("./neon/mirror.server")).resyncScope("notifications", "user_id", post.author_id);
      }
    }

    return readPollResults(context.supabase, data.pollId, context.userId);
  });

export const getPollResults = createServerFn({ method: "GET" })
  .validator((input) =>
    z.object({ pollId: z.string().uuid(), userId: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const supabase = createPublicClient();
    return readPollResults(supabase, data.pollId, data.userId ?? null);
  });
