import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { Mail } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { getConversations } from "@/lib/messages.functions";

const conversationsQueryOptions = () => ({
  queryKey: ["conversations"],
  queryFn: () => getConversations(),
});

export const Route = createFileRoute("/_authenticated/messages/")({
  head: () => ({
    meta: [
      { title: "Messages / DeepSocial" },
      { name: "description", content: "Your private direct message conversations on DeepSocial." },
      { property: "og:title", content: "Messages / DeepSocial" },
      { property: "og:description", content: "Your private direct message conversations on DeepSocial." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MessagesInbox,
  errorComponent: ({ error }) => (
    <AppShell hideRightSidebar>
      <div role="alert" className="p-8 text-center text-muted-foreground">
        {(error as Error).message}
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell hideRightSidebar>
      <div className="p-8 text-center text-muted-foreground">No conversations found.</div>
    </AppShell>
  ),
});

function MessagesInbox() {
  const { data: conversations } = useSuspenseQuery(conversationsQueryOptions());

  return (
    <AppShell hideRightSidebar>
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md">
        <h1 className="text-xl font-bold">Messages</h1>
      </div>

      {conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-4 py-20 text-center text-muted-foreground">
          <Mail className="h-12 w-12" />
          <p className="mt-4 text-2xl font-bold text-foreground">Welcome to your inbox!</p>
          <p className="mt-2 max-w-sm">
            Visit someone's profile and tap Message to start a private conversation.
          </p>
        </div>
      ) : (
        <ul>
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                to="/messages/$conversationId"
                params={{ conversationId: conversation.id }}
                data-testid="conversation-item"
                className="flex gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-accent/40"
              >
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
                  {conversation.other?.avatar_url ? (
                    <img
                      src={conversation.other.avatar_url}
                      alt={conversation.other.display_name ?? conversation.other.username}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center font-bold text-muted-foreground">
                      {(conversation.other?.display_name ?? conversation.other?.username ?? "?")
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="truncate font-bold">
                      {conversation.other?.display_name ?? conversation.other?.username ?? "Unknown"}
                    </span>
                    <span className="truncate text-muted-foreground">
                      @{conversation.other?.username ?? "unknown"}
                    </span>
                    {conversation.last_message && (
                      <span className="ml-auto shrink-0 text-sm text-muted-foreground">
                        {formatDistanceToNowStrict(new Date(conversation.last_message.created_at))}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[15px] text-muted-foreground">
                    {conversation.last_message?.content ?? "No messages yet"}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
