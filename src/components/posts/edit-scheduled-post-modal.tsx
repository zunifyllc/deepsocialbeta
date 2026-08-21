import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { updateScheduledPost } from "@/lib/posts.functions";
import type { Post } from "@/lib/posts.functions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  isValidScheduleTime,
  isoToLocalInput,
  localInputToIso,
} from "@/lib/schedule-helpers";

const MAX = 280;

interface EditScheduledPostModalProps {
  post: Post;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditScheduledPostModal({ post, open, onOpenChange }: EditScheduledPostModalProps) {
  const [content, setContent] = useState(post.content);
  const [when, setWhen] = useState(post.scheduled_at ? isoToLocalInput(post.scheduled_at) : "");
  const queryClient = useQueryClient();
  const submit = useServerFn(updateScheduledPost);

  useEffect(() => {
    if (open) {
      setContent(post.content);
      setWhen(post.scheduled_at ? isoToLocalInput(post.scheduled_at) : "");
    }
  }, [open, post.content, post.scheduled_at]);

  const timeChanged = post.scheduled_at ? when !== isoToLocalInput(post.scheduled_at) : Boolean(when);
  const timeValid = !when || isValidScheduleTime(when);

  const mutation = useMutation({
    mutationFn: () =>
      submit({
        data: {
          postId: post.id,
          content: content.trim(),
          ...(timeChanged && when ? { scheduledAt: localInputToIso(when) } : {}),
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["scheduled-posts"] });
      onOpenChange(false);
      toast.success("Scheduled post updated");
    },
    onError: (error: Error) => toast.error(error.message || "Could not update the scheduled post"),
  });

  const remaining = MAX - content.length;
  const canSubmit = content.trim().length > 0 && remaining >= 0 && timeValid && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit scheduled post</DialogTitle>
        </DialogHeader>

        <textarea
          data-testid="edit-scheduled-input"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          className="w-full resize-none bg-transparent text-lg outline-none placeholder:text-muted-foreground"
        />

        <div>
          <label className="block text-sm font-medium" htmlFor="edit-schedule-at">
            Scheduled time
          </label>
          <input
            id="edit-schedule-at"
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="mt-2 w-full rounded-lg border border-border bg-transparent p-2 text-sm"
          />
          {!timeValid && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              Pick a time at least 5 minutes from now.
            </p>
          )}
        </div>

        {post.media_urls && post.media_urls.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {post.media_urls.length} attached image(s) will be published with this post.
          </p>
        )}

        <div className="flex items-center justify-end gap-3">
          <span className={`text-sm ${remaining < 0 ? "text-destructive" : "text-muted-foreground"}`}>
            {remaining}
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full font-bold">
            Cancel
          </Button>
          <Button
            data-testid="edit-scheduled-submit"
            onClick={() => mutation.mutate()}
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
