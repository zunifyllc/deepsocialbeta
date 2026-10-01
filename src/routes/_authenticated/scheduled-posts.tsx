import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock, Pencil, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { PostContent } from "@/components/posts/post-content";
import { MediaGrid } from "@/components/posts/media-grid";
import { EditScheduledPostModal } from "@/components/posts/edit-scheduled-post-modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  cancelScheduledPost,
  getScheduledPosts,
  publishNow,
  type Post,
} from "@/lib/posts.functions";
import { formatScheduleTime } from "@/lib/schedule-helpers";

export const Route = createFileRoute("/_authenticated/scheduled-posts")({
  head: () => ({
    meta: [
      { title: "Scheduled posts / DeepSocial" },
      {
        name: "description",
        content: "Review, edit, publish or cancel the DeepSocial posts you have queued for later.",
      },
      { property: "og:title", content: "Scheduled posts / DeepSocial" },
      {
        property: "og:description",
        content: "Review, edit, publish or cancel the DeepSocial posts you have queued for later.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScheduledPostsPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div role="alert" className="p-8 text-center text-muted-foreground">
        {(error as Error).message}
      </div>
    </AppShell>
  ),
});

function ScheduledPostsPage() {
  const queryClient = useQueryClient();
  const fetchScheduled = useServerFn(getScheduledPosts);
  const publish = useServerFn(publishNow);
  const cancel = useServerFn(cancelScheduledPost);

  const [editing, setEditing] = useState<Post | null>(null);
  const [deleting, setDeleting] = useState<Post | null>(null);

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["scheduled-posts"],
    queryFn: () => fetchScheduled({}),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["scheduled-posts"] });
    void queryClient.invalidateQueries({ queryKey: ["feed"] });
    void queryClient.invalidateQueries({ queryKey: ["posts"] });
  };

  const publishMutation = useMutation({
    mutationFn: (postId: string) => publish({ data: { postId } }),
    onSuccess: () => {
      invalidate();
      toast.success("Post published");
    },
    onError: (error: Error) => toast.error(error.message || "Could not publish the post"),
  });

  const cancelMutation = useMutation({
    mutationFn: (postId: string) => cancel({ data: { postId } }),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast.success("Scheduled post deleted");
    },
    onError: (error: Error) => toast.error(error.message || "Could not delete the post"),
  });

  return (
    <AppShell>
      <div className="border-b border-border p-4">
        <h1 className="text-xl font-bold">Scheduled</h1>
        <p className="text-sm text-muted-foreground">Posts waiting to go live. Only you can see these.</p>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">Loading...</div>
      ) : posts.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">No scheduled posts yet.</div>
      ) : (
        <ul>
          {posts.map((post) => (
            <li key={post.id} className="border-b border-border p-4" data-testid="scheduled-post">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
                <Clock className="h-4 w-4" />
                {post.scheduled_at ? formatScheduleTime(post.scheduled_at) : "Pending"}
              </div>

              <div className="whitespace-pre-wrap break-words text-[15px]">
                <PostContent content={post.content} />
              </div>

              {post.media_urls && post.media_urls.length > 0 && (
                <div className="mt-3">
                  <MediaGrid media={post.media_urls} />
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="rounded-full font-bold"
                  disabled={publishMutation.isPending}
                  onClick={() => publishMutation.mutate(post.id)}
                >
                  <Send className="mr-1 h-4 w-4" /> Post now
                </Button>
                <Button size="sm" variant="outline" className="rounded-full font-bold" onClick={() => setEditing(post)}>
                  <Pencil className="mr-1 h-4 w-4" /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full font-bold text-destructive hover:text-destructive"
                  onClick={() => setDeleting(post)}
                >
                  <Trash2 className="mr-1 h-4 w-4" /> Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <EditScheduledPostModal
          post={editing}
          open={!!editing}
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete scheduled post?</AlertDialogTitle>
            <AlertDialogDescription>
              This post will never be published. This action can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && cancelMutation.mutate(deleting.id)}
              disabled={cancelMutation.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
