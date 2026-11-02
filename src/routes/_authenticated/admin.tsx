import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getAllUsers, getMyAdminStatus, unverifyUser, verifyUser } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Admin · Verification — DeepSocial" },
      { name: "description", content: "Grant or remove verified badges on DeepSocial profiles." },
      { property: "og:title", content: "Admin · Verification — DeepSocial" },
      { property: "og:description", content: "Grant or remove verified badges on DeepSocial profiles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

function VerifiedTick() {
  return (
    <svg className="h-4 w-4 flex-shrink-0 text-primary" fill="currentColor" viewBox="0 0 24 24">
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
  );
}

function AdminPage() {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 300);
  const queryClient = useQueryClient();

  const fetchStatus = useServerFn(getMyAdminStatus);
  const fetchUsers = useServerFn(getAllUsers);
  const verify = useServerFn(verifyUser);
  const unverify = useServerFn(unverifyUser);

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["admin-status"],
    queryFn: () => fetchStatus({}),
  });

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users", debounced],
    queryFn: () => fetchUsers({ data: { search: debounced || undefined, page: 0, pageSize: 25 } }),
    enabled: status?.isAdmin === true,
  });

  const toggle = useMutation({
    mutationFn: ({ userId, next }: { userId: string; next: boolean }) =>
      next ? verify({ data: { userId } }) : unverify({ data: { userId } }),
    onSuccess: (row) => {
      toast.success(row.is_verified ? `@${row.username} is now verified` : `@${row.username} is no longer verified`);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: () => toast.error("Could not update verification"),
  });

  return (
    <AppShell>
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Verification admin</h1>
      </div>

      {statusLoading ? (
        <p className="p-6 text-muted-foreground">Checking permissions…</p>
      ) : !status?.isAdmin ? (
        <p className="p-6 text-muted-foreground">You don’t have access to this page.</p>
      ) : (
        <>
          <div className="border-b border-border p-4">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users by name or @username"
              className="rounded-full"
            />
          </div>

          {isLoading ? (
            <p className="p-6 text-muted-foreground">Loading users…</p>
          ) : !users?.length ? (
            <p className="p-6 text-muted-foreground">No users found.</p>
          ) : (
            <ul>
              {users.map((u) => (
                <li key={u.id} className="flex items-center gap-3 border-b border-border px-4 py-3">
                  <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-muted">
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt={u.display_name ?? u.username} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">
                        {(u.display_name ?? u.username).charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/$username"
                      params={{ username: u.username }}
                      className="flex items-center gap-1 font-bold hover:underline"
                    >
                      <span className="truncate">{u.display_name ?? u.username}</span>
                      {u.is_verified && <VerifiedTick />}
                    </Link>
                    <p className="truncate text-sm text-muted-foreground">@{u.username}</p>
                  </div>
                  <Button
                    variant={u.is_verified ? "outline" : "default"}
                    className="rounded-full font-bold"
                    disabled={toggle.isPending}
                    onClick={() => toggle.mutate({ userId: u.id, next: !u.is_verified })}
                  >
                    {u.is_verified ? "Unverify" : "Verify"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </AppShell>
  );
}
