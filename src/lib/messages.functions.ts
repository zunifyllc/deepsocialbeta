import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (data.userId === context.userId) throw new Error("You cannot message yourself");

    const { data: conversationId, error } = await context.supabase.rpc("get_or_create_conversation", {
      target_user_id: data.userId,
    });
    if (error) throw error;
    const { resyncScope } = await import("./neon/mirror.server");
    await resyncScope("conversations", "id", conversationId as string);
    return { conversationId: conversationId as string };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        conversationId: z.string().uuid(),
        content: z.string().trim().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: message, error } = await context.supabase
      .from("messages")
      .insert({
        conversation_id: data.conversationId,
        sender_id: context.userId,
        content: data.content,
      })
      .select(`id, conversation_id, sender_id, content, created_at, sender:profiles!messages_sender_id_profiles_fkey(${PARTICIPANT_FIELDS})`)
      .single();
    if (error) throw error;
    const { resyncScope } = await import("./neon/mirror.server");
    await resyncScope("conversations", "id", data.conversationId);
    await resyncScope("messages", "conversation_id", data.conversationId);
    return message as unknown as Message;
  });

export const getConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listConversations } = await import("./neon/features.server");
    return (await listConversations(context.userId)) as unknown as ConversationSummary[];
  });

export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { getConversationFor } = await import("./neon/features.server");
    const conversation = await getConversationFor(context.userId, data.conversationId);
    if (!conversation) throw new Error("Conversation not found");
    return { id: conversation.id, other: (conversation.other as unknown as MessageParticipant | null) ?? null };
  });

export const getMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { listMessages } = await import("./neon/features.server");
    return (await listMessages(context.userId, data.conversationId)) as unknown as Message[];
  });
