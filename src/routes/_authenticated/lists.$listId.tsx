import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Globe, Lock, Settings2, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { PostCard } from "@/components/posts/post-card";
import { ManageMembersDialog } from "@/components/lists/manage-members-dialog";
import { deleteList, getListById, getListFeed, updateList } from "@/lib/lists.functions";
import { deletePost } from "@/lib/posts.functions";

const listQueryOptions = (listId: string) => ({
  queryKey: ["list", listId],
  queryFn: () => getListById({ data: { listId } }),
});

const listFeedQueryOptions = (listId: string) => ({
  queryKey: ["list-feed", listId],
  queryFn: () => getListFeed({ data: { listId } }),
});

export const Route = createFileRoute("/_authenticated/lists/$listId")({
  head: () => ({
    meta: [
      { title: "List timeline / DeepSocial" },
      { name: "description", content: "Posts from the members of this DeepSocial List." },
      { property: "og:title", content: "List timeline / DeepSocial" },
      { property: "og:description", content: "Posts from the members of this DeepSocial List." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ListDetailPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div role="alert" className="p-8 text-center text-muted-foreground">
        {error.message}
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <div className="p-8 text-center text-muted-foreground">This List doesn't exist.</div>
    </AppShell>
  ),
});

function ListDetailPage() {
  const { listId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(listQueryOptions(listId));
  const { data: posts } = useSuspenseQuery(listFeedQueryOptions(listId));
  const [manageOpen, setManageOpen] = useState(false);

  const removeList = useServerFn(deleteList);
  const saveList = useServerFn(updateList);
  const removePost = useServerFn(deletePost);

  if (!data) {
    return (
      <AppShell>
        <div className="p-8 text-center text-muted-foreground">
          This List is private or no longer exists.
        </div>
      </AppShell>
    );
  }

  const { list, members, isOwner } = data;

  const handleVisibility = async () => {
    await saveList({ data: { listId, isPublic: !list.is_public } });
    queryClient.invalidateQueries({ queryKey: ["list", listId] });
    queryClient.invalidateQueries({ queryKey: ["lists"] });
  };

  const handleDeleteList = async () => {
    await removeList({ data: { listId } });
    queryClient.invalidateQueries({ queryKey: ["lists"] });
    navigate({ to: "/lists" });
  };

  const handleDeletePost = async (id: string) => {
    await removePost({ data: { id } });
    queryClient.invalidateQueries({ queryKey: ["list-feed", listId] });
  };

  return (
    <AppShell>
      <div className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 px-4 py-2 backdrop-blur-md">
        <Link to="/lists" className="rounded-full p-2 transition-colors hover:bg-accent" aria-label="Back to Lists">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold leading-tight">{list.name}</h1>
          {list.creator && (
            <p className="truncate text-sm text-muted-foreground">@{list.creator.username}</p>
          )}
        </div>
        {isOwner && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Manage members"
              className="rounded-full border-border bg-transparent hover:bg-accent"
              onClick={() => setManageOpen(true)}
              data-testid="manage-members-button"
            >
              <Settings2 className="h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Delete List"
              className="rounded-full border-border bg-transparent text-destructive hover:bg-accent"
              onClick={handleDeleteList}
            >
              <Trash2 className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>

      <div className="border-b border-border px-4 py-4">
        {list.description && <p className="text-[15px]">{list.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            {list.is_public ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            {list.is_public ? "Public" : "Private"}
          </span>
          <span>
            <span className="font-bold text-foreground">{members.length}</span>{" "}
            {members.length === 1 ? "member" : "members"}
          </span>
          {isOwner && (
            <button onClick={handleVisibility} className="font-semibold text-primary hover:underline">
              Make {list.is_public ? "private" : "public"}
            </button>
          )}
        </div>

        {members.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {members.map((member) => (
              <Link
                key={member.id}
                to="/$username"
                params={{ username: member.username }}
                className="flex items-center gap-2 rounded-full border border-border px-2 py-1 text-sm transition-colors hover:bg-accent"
              >
                <span className="h-6 w-6 overflow-hidden rounded-full bg-muted">
                  {member.avatar_url ? (
                    <img src={member.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-muted-foreground">
                      {(member.display_name ?? member.username).charAt(0).toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="truncate">{member.display_name ?? member.username}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        {posts.length === 0 ? (
          <p className="px-8 py-12 text-center text-muted-foreground">
            {members.length === 0
              ? "Add people to this List to see their posts here."
              : "No posts from List members yet."}
          </p>
        ) : (
          posts.map((post) => (
            <PostCard key={post.feedKey ?? post.id} post={post} onDelete={handleDeletePost} />
          ))
        )}
      </div>

      {isOwner && (
        <ManageMembersDialog
          listId={listId}
          members={members}
          open={manageOpen}
          onOpenChange={setManageOpen}
        />
      )}
    </AppShell>
  );
}
