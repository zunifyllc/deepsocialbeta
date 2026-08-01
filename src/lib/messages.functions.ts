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
    return message as unknown as Message;
  });

export const getConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: conversations, error } = await context.supabase
      .from("conversations")
      .select("id, participants, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    const rows = conversations ?? [];
    if (rows.length === 0) return [] as ConversationSummary[];

    const otherIds = Array.from(
      new Set(
        rows
          .map((row) => (row.participants ?? []).find((id) => id !== context.userId))
          .filter((id): id is string => !!id),
      ),
    );

    const [{ data: profiles }, { data: messages }] = await Promise.all([
      context.supabase.from("profiles").select(PARTICIPANT_FIELDS).in("id", otherIds),
      context.supabase
        .from("messages")
        .select("id, conversation_id, content, created_at, sender_id")
        .in(
          "conversation_id",
          rows.map((row) => row.id),
        )
        .order("created_at", { ascending: false }),
    ]);

    const profileById = new Map((profiles ?? []).map((p) => [p.id, p as MessageParticipant]));
    const lastByConversation = new Map<string, ConversationSummary["last_message"]>();
    for (const message of messages ?? []) {
      if (!lastByConversation.has(message.conversation_id)) {
        lastByConversation.set(message.conversation_id, {
          id: message.id,
          content: message.content,
          created_at: message.created_at,
          sender_id: message.sender_id,
        });
      }
    }

    return rows.map((row) => {
      const otherId = (row.participants ?? []).find((id) => id !== context.userId);
      return {
        id: row.id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        other: otherId ? profileById.get(otherId) ?? null : null,
        last_message: lastByConversation.get(row.id) ?? null,
      } satisfies ConversationSummary;
    });
  });

export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: conversation, error } = await context.supabase
      .from("conversations")
      .select("id, participants, created_at, updated_at")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (error) throw error;
    if (!conversation) throw new Error("Conversation not found");

    const otherId = (conversation.participants ?? []).find((id) => id !== context.userId);
    let other: MessageParticipant | null = null;
    if (otherId) {
      const { data: profile } = await context.supabase
        .from("profiles")
        .select(PARTICIPANT_FIELDS)
        .eq("id", otherId)
        .maybeSingle();
      other = (profile as MessageParticipant | null) ?? null;
    }

    return { id: conversation.id, other };
  });

export const getMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: messages, error } = await context.supabase
      .from("messages")
      .select(`id, conversation_id, sender_id, content, created_at, sender:profiles!messages_sender_id_profiles_fkey(${PARTICIPANT_FIELDS})`)
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    return (messages ?? []) as unknown as Message[];
  });
