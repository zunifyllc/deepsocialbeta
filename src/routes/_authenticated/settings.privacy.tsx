import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import {
  getMutedUsers,
  getBlockedUsers,
  toggleMute,
  toggleBlock,
  type PrivacyUser,
} from "@/lib/privacy.functions";

export const Route = createFileRoute("/_authenticated/settings/privacy")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Privacy: mute & block / DeepSocial" },
      {
        name: "description",
        content: "Manage the DeepSocial accounts you have muted or blocked.",
      },
      { property: "og:title", content: "Privacy: mute & block / DeepSocial" },
      {
        property: "og:description",
        content: "Manage the DeepSocial accounts you have muted or blocked.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacySettingsPage,
});

function PrivacySettingsPage() {
  const fetchMuted = useServerFn(getMutedUsers);
  const fetchBlocked = useServerFn(getBlockedUsers);
  const unmute = useServerFn(toggleMute);
  const unblock = useServerFn(toggleBlock);
  const queryClient = useQueryClient();

  const { data: muted } = useQuery({ queryKey: ["muted-users"], queryFn: () => fetchMuted({}) });
  const { data: blocked } = useQuery({ queryKey: ["blocked-users"], queryFn: () => fetchBlocked({}) });

  const handleUnmute = async (userId: string, username: string) => {
    try {
      await unmute({ data: { targetUserId: userId } });
      toast.success(`Unmuted @${username}`);
      queryClient.invalidateQueries();
    } catch {
      toast.error("Could not unmute");
    }
  };

  const handleUnblock = async (userId: string, username: string) => {
    try {
      await unblock({ data: { targetUserId: userId } });
      toast.success(`Unblocked @${username}`);
      queryClient.invalidateQueries();
    } catch {
      toast.error("Could not unblock");
    }
  };

  return (
    <AppShell>
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md">
        <h1 className="text-xl font-bold">Privacy</h1>
        <p className="text-sm text-muted-foreground">Muted and blocked accounts</p>
      </div>

      <section className="border-b border-border p-4">
        <h2 className="mb-1 text-lg font-bold">Muted accounts</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          You won't see their posts or notifications. They aren't told.
        </p>
        <UserRows
          users={muted ?? []}
          emptyText="You haven't muted anyone."
          actionLabel="Unmute"
          onAction={handleUnmute}
        />
      </section>

      <section className="p-4">
        <h2 className="mb-1 text-lg font-bold">Blocked accounts</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          You and they cannot see each other's profiles, posts, or interact.
        </p>
        <UserRows
          users={blocked ?? []}
          emptyText="You haven't blocked anyone."
          actionLabel="Unblock"
          onAction={handleUnblock}
        />
      </section>
    </AppShell>
  );
}

interface UserRowsProps {
  users: PrivacyUser[];
  emptyText: string;
  actionLabel: string;
  onAction: (userId: string, username: string) => void;
}

function UserRows({ users, emptyText, actionLabel, onAction }: UserRowsProps) {
  if (users.length === 0) {
    return <p className="text-muted-foreground">{emptyText}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {users.map((u) => (
        <li key={u.id} className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/30">
          <div className="h-10 w-10 overflow-hidden rounded-full bg-muted">
            {u.avatar_url ? (
              <img src={u.avatar_url} alt={u.display_name ?? u.username} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">
                {(u.display_name ?? u.username).charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <Link to="/$username" params={{ username: u.username }} className="min-w-0 flex-1">
            <span className="block truncate font-bold hover:underline">{u.display_name ?? u.username}</span>
            <span className="block truncate text-sm text-muted-foreground">@{u.username}</span>
          </Link>
          <Button
            variant="outline"
            className="rounded-full border-border bg-transparent font-bold"
            onClick={() => onAction(u.id, u.username)}
          >
            {actionLabel}
          </Button>
        </li>
      ))}
    </ul>
  );
}
