import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-middleware";
import { pollInputSchema } from "./poll-helpers";

export const createPoll = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((input) => z.object({ postId: z.string().uuid() }).merge(pollInputSchema).parse(input))
  .handler(async ({ data, context }) => {
    const W = await import("./neon/writes.server");
    return { pollId: await W.createPoll(context.userId, data.postId, data.options, data.durationHours) };
  });

export const deletePoll = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((input) => z.object({ pollId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const W = await import("./neon/writes.server");
    await W.deletePoll(context.userId, data.pollId);
    return { success: true };
  });

export const votePoll = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((input) =>
    z.object({ pollId: z.string().uuid(), optionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const W = await import("./neon/writes.server");
    await W.ensureActor(context.userId);
    await W.votePoll(context.userId, data.pollId, data.optionId);
    const { readPollResultsNeon } = await import("./neon/features.server");
    return readPollResultsNeon(data.pollId, context.userId);
  });

export const getPollResults = createServerFn({ method: "GET" })
  .validator((input) =>
    z.object({ pollId: z.string().uuid(), userId: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { readPollResultsNeon } = await import("./neon/features.server");
    return readPollResultsNeon(data.pollId, data.userId ?? null);
  });
