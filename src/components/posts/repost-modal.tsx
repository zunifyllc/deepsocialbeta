import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toggleRepost } from "@/lib/reposts.functions";
import type { Post } from "@/lib/posts.functions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const MAX = 280;

interface RepostModalProps {
  post: Post;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function RepostModal({ post, open, onOpenChange, onSuccess }: RepostModalProps) {
  const [quote, setQuote] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const toggle = useServerFn(toggleRepost);

  const remaining = MAX - quote.length;
  const canSubmit = quote.trim().length > 0 && remaining >= 0 && !isLoading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsLoading(true);
    try {
      await toggle({ data: { postId: post.id, quoteContent: quote.trim() } });
      setQuote("");
      onOpenChange(false);
      onSuccess?.();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Quote repost</DialogTitle>
        </DialogHeader>

        <textarea
          data-testid="quote-input"
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
          placeholder="Add a comment"
          rows={3}
          className="w-full resize-none bg-transparent text-lg outline-none placeholder:text-muted-foreground"
        />

        <div className="rounded-2xl border border-border p-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-bold">{post.author?.display_name ?? post.author?.username}</span>
            <span className="text-muted-foreground">@{post.author?.username}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{post.content}</p>
        </div>

        <div className="flex items-center justify-end gap-3">
          <span className={`text-sm ${remaining < 0 ? "text-destructive" : "text-muted-foreground"}`}>
            {remaining}
          </span>
          <Button
            data-testid="quote-submit"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-full font-bold"
          >
            Repost
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
