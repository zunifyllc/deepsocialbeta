import { useEffect, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { MessageComposer } from "@/components/messages/message-composer";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getConversation, getMessages, sendMessage, type Message } from "@/lib/messages.functions";

const messagesQueryOptions = (conversationId: string) => ({
  queryKey: ["messages", conversationId],
  queryFn: () => getMessages({ data: { conversationId } }),
});

const conversationQueryOptions = (conversationId: string) => ({
  queryKey: ["conversation", conversationId],
  queryFn: () => getConversation({ data: { conversationId } }),
});

export const Route = createFileRoute("/_authenticated/messages/$conversationId")({
  head: () => ({
    meta: [
      { title: "Conversation / DeepSocial" },
      { name: "description", content: "A private one-on-one conversation on DeepSocial." },
      { property: "og:title", content: "Conversation / DeepSocial" },
      { property: "og:description", content: "A private one-on-one conversation on DeepSocial." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConversationPage,
  errorComponent: ({ error }) => (
    <AppShell hideRightSidebar>
      <div role="alert" className="p-8 text-center text-muted-foreground">
        {error.message}
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell hideRightSidebar>
      <div className="p-8 text-center text-muted-foreground">Conversation not found.</div>
    </AppShell>
  ),
});

function ConversationPage() {
  const { conversationId } = Route.useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const send = useServerFn(sendMessage);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: conversation } = useSuspenseQuery(conversationQueryOptions(conversationId));
  const { data: messages } = useSuspenseQuery(messagesQueryOptions(conversationId));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const incoming = payload.new as Message;
          queryClient.setQueryData<Message[]>(["messages", conversationId], (prev) => {
            const list = prev ?? [];
            if (list.some((message) => message.id === incoming.id)) return list;
            return [...list, incoming];
          });
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  const handleSend = async (content: string) => {
    const message = await send({ data: { conversationId, content } });
    queryClient.setQueryData<Message[]>(["messages", conversationId], (prev) => {
      const list = prev ?? [];
      if (list.some((item) => item.id === message.id)) return list;
      return [...list, message];
    });
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
  };

  const other = conversation.other;

  return (
    <AppShell hideRightSidebar>
      <div className="flex h-[calc(100vh-4rem)] flex-col md:h-screen">
        <div className="flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md">
          <Link to="/messages" className="rounded-full p-2 transition-colors hover:bg-accent">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted">
            {other?.avatar_url ? (
              <img src={other.avatar_url} alt={other.display_name ?? other.username} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">
                {(other?.display_name ?? other?.username ?? "?").charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold leading-tight">
              {other?.display_name ?? other?.username ?? "Unknown"}
            </h1>
            {other && (
              <Link to="/$username" params={{ username: other.username }} className="text-sm text-muted-foreground hover:underline">
                @{other.username}
              </Link>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <p className="py-10 text-center text-muted-foreground">
              No messages yet — say hello.
            </p>
          )}
          <div className="flex flex-col gap-2">
            {messages.map((message) => {
              const isMine = message.sender_id === user?.id;
              return (
                <div
                  key={message.id}
                  data-testid="message-bubble"
                  className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`max-w-[75%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2 text-[15px] ${
                      isMine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                    }`}
                  >
                    {message.content}
                  </div>
                  <span className="mt-1 text-xs text-muted-foreground">
                    {format(new Date(message.created_at), "MMM d, h:mm a")}
                  </span>
                </div>
              );
            })}
          </div>
          <div ref={bottomRef} />
        </div>

        <MessageComposer onSend={handleSend} />
      </div>
    </AppShell>
  );
}
