import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { Mail } from "lucide-react";

export const Route = createFileRoute("/_authenticated/messages")({
  head: () => ({
    meta: [
      { title: "Messages / X Clone" },
      { name: "description", content: "Direct messages on X Clone." },
    ],
  }),
  component: MessagesPage,
});

function MessagesPage() {
  return (
    <AppShell hideRightSidebar>
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md">
        <h1 className="text-xl font-bold">Messages</h1>
      </div>
      <div className="flex h-[calc(100vh-120px)] flex-col items-center justify-center px-4 text-center text-muted-foreground">
        <Mail className="h-12 w-12" />
        <p className="mt-4 text-2xl font-bold text-foreground">Welcome to your inbox!</p>
        <p className="mt-2 max-w-sm">Direct messaging is coming soon. For now, mentions and replies appear in Notifications.</p>
      </div>
    </AppShell>
  );
}
