import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-middleware";

export interface MessageParticipant {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified?: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: MessageParticipant | null;
}

export interface ConversationSummary {
  id: string;
  created_at: string;
  updated_at: string;
  other: MessageParticipant | null;
  last_message: { id: string; content: string; created_at: string; sender_id: string } | null;
}

const PARTICIPANT_FIELDS = "id, username, display_name, avatar_url, is_verified";

export const startConversation = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const W = await import("./neon/writes.server");
    if (data.userId === context.userId) throw new Error("You cannot message yourself");
    await W.ensureActor(context.userId);
    // Blocked users cannot start or re-open conversations in either direction.
    const { assertNotBlocked } = await import("./privacy-helpers.server");
    await assertNotBlocked(context.userId, data.userId);
    return { conversationId: await W.getOrCreateConversation(context.userId, data.userId) };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        content: z.string().trim().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const [{ getConversationFor }, { assertNotBlocked }, W] = await Promise.all([
      import("./neon/features.server"),
      import("./privacy-helpers.server"),
      import("./neon/writes.server"),
    ]);
    // A valid session and membership are necessary but not sufficient:
    // a newly added block must also stop messages to an EXISTING conversation.
    const conversation = await getConversationFor(context.userId, data.conversationId);
    const otherId = conversation?.other?.["id"];
    if (typeof otherId !== "string") throw new Error("Conversation not found");
    await assertNotBlocked(context.userId, otherId);
    return (await W.sendMessage(context.userId, data.conversationId, data.content)) as unknown as Message;
  });

export const getConversations = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { listConversations } = await import("./neon/features.server");
    return (await listConversations(context.userId)) as unknown as ConversationSummary[];
  });

export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((input) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getConversationFor } = await import("./neon/features.server");
    const conversation = await getConversationFor(context.userId, data.conversationId);
    if (!conversation) throw new Error("Conversation not found");
    return { id: conversation.id, other: (conversation.other as unknown as MessageParticipant | null) ?? null };
  });

export const getMessages = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .validator((input) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { listMessages } = await import("./neon/features.server");
    return (await listMessages(context.userId, data.conversationId)) as unknown as Message[];
  });
