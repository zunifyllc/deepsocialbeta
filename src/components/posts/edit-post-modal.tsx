import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { editPost } from "@/lib/posts.functions";
import type { Post } from "@/lib/posts.functions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const MAX = 280;

interface EditPostModalProps {
  post: Post;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdited?: (post: Post) => void;
}

export function EditPostModal({ post, open, onOpenChange, onEdited }: EditPostModalProps) {
  const [content, setContent] = useState(post.content);
  const queryClient = useQueryClient();
  const router = useRouter();
  const submit = useServerFn(editPost);

  useEffect(() => {
    if (open) setContent(post.content);
  }, [open, post.content]);

  const mutation = useMutation({
    mutationFn: (newContent: string) => submit({ data: { postId: post.id, newContent } }),
    onSuccess: (updated) => {
      // Patch every cached feed that already contains this post, so the new
      // text shows instantly without refetching the whole timeline.
      queryClient.setQueriesData<unknown>({ queryKey: ["posts"] }, (old: unknown) => patchPost(old, updated));
      queryClient.setQueriesData<unknown>({ queryKey: ["feed"] }, (old: unknown) => patchPost(old, updated));
      queryClient.setQueriesData<unknown>({ queryKey: ["post", post.id] }, (old: unknown) => patchPost(old, updated));
      queryClient.setQueriesData<unknown>({ queryKey: ["replies"] }, (old: unknown) => patchPost(old, updated));
      // Post detail reads its post from the route loader, not the query cache.
      void router.invalidate();
      onEdited?.(updated as Post);
      onOpenChange(false);
      toast.success("Post updated");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Could not update the post");
    },
  });

  const remaining = MAX - content.length;
  const trimmed = content.trim();
  const canSubmit =
    trimmed.length > 0 && remaining >= 0 && trimmed !== post.content.trim() && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit post</DialogTitle>
        </DialogHeader>

        <textarea
          data-testid="edit-post-input"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          className="w-full resize-none bg-transparent text-lg outline-none placeholder:text-muted-foreground"
        />

        {post.media_urls && post.media_urls.length > 0 && (
          <p className="text-sm text-muted-foreground">Attached media can&apos;t be changed when editing.</p>
        )}

        <div className="flex items-center justify-end gap-3">
          <span className={`text-sm ${remaining < 0 ? "text-destructive" : "text-muted-foreground"}`}>
            {remaining}
          </span>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-full font-bold"
          >
            Cancel
          </Button>
          <Button
            data-testid="edit-post-submit"
            onClick={() => mutation.mutate(trimmed)}
            disabled={!canSubmit}
            className="rounded-full font-bold"
          >
            {mutation.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Replaces the edited post wherever it appears in a cached value: a single
 * post, an array of feed items, or an infinite-query page structure.
 */
function patchPost(old: unknown, updated: Post): unknown {
  if (!old) return old;
  if (Array.isArray(old)) return old.map((item) => patchPost(item, updated));
  if (typeof old === "object") {
    const record = old as Record<string, unknown>;
    if (record["id"] === updated.id && typeof record["content"] === "string") {
      return {
        ...record,
        content: updated.content,
        is_edited: true,
        edited_at: updated.edited_at,
      };
    }
    if (Array.isArray(record["pages"])) {
      return { ...record, pages: record["pages"].map((page) => patchPost(page, updated)) };
    }
    if (Array.isArray(record["posts"])) {
      return { ...record, posts: record["posts"].map((p) => patchPost(p, updated)) };
    }
    if (Array.isArray(record["items"])) {
      return { ...record, items: record["items"].map((p) => patchPost(p, updated)) };
    }
    if (record["post"] && typeof record["post"] === "object") {
      return { ...record, post: patchPost(record["post"], updated) };
    }
  }
  return old;
}
