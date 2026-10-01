import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Lock, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { CreateListDialog } from "@/components/lists/create-list-dialog";
import { getUserLists } from "@/lib/lists.functions";

const listsQueryOptions = () => ({
  queryKey: ["lists"],
  queryFn: () => getUserLists({ data: {} }),
});

export const Route = createFileRoute("/_authenticated/lists/")({
  head: () => ({
    meta: [
      { title: "Your Lists / DeepSocial" },
      { name: "description", content: "Create Lists of people and read a timeline of just their posts." },
      { property: "og:title", content: "Your Lists / DeepSocial" },
      { property: "og:description", content: "Create Lists of people and read a timeline of just their posts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ListsPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div role="alert" className="p-8 text-center text-muted-foreground">
        {(error as Error).message}
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <div className="p-8 text-center text-muted-foreground">No Lists found.</div>
    </AppShell>
  ),
});

function ListsPage() {
  const queryClient = useQueryClient();
  const { data: lists } = useSuspenseQuery(listsQueryOptions());
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["lists"] });

  return (
    <AppShell>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md">
        <div>
          <h1 className="text-xl font-bold">Lists</h1>
          <p className="text-sm text-muted-foreground">Curated timelines of the people you choose.</p>
        </div>
        <Button
          size="icon"
          aria-label="Create a new List"
          className="rounded-full"
          onClick={() => setCreateOpen(true)}
          data-testid="new-list-button"
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>

      {lists.length === 0 ? (
        <div className="px-8 py-16 text-center">
          <h2 className="text-2xl font-extrabold">You haven't created any Lists yet</h2>
          <p className="mt-2 text-muted-foreground">
            When you do, they'll show up here so you can jump straight into their timelines.
          </p>
          <Button className="mt-6 rounded-full font-bold" onClick={() => setCreateOpen(true)}>
            Create a List
          </Button>
        </div>
      ) : (
        <div>
          {lists.map((list) => (
            <Link
              key={list.id}
              to="/lists/$listId"
              params={{ listId: list.id }}
              className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-muted/20"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-bold">
                  <span className="truncate">{list.name}</span>
                  {list.is_public ? (
                    <Globe className="h-4 w-4 text-muted-foreground" aria-label="Public List" />
                  ) : (
                    <Lock className="h-4 w-4 text-muted-foreground" aria-label="Private List" />
                  )}
                </p>
                {list.description && (
                  <p className="truncate text-sm text-muted-foreground">{list.description}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  {list.member_count ?? 0} {list.member_count === 1 ? "member" : "members"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <CreateListDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={refresh} />
    </AppShell>
  );
}
