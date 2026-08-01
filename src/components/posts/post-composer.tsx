import { useState, useRef } from "react";
import { Image, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { createPost } from "@/lib/posts.functions";

interface PostComposerProps {
  parentPostId?: string;
  placeholder?: string;
  buttonText?: string;
  onSuccess?: () => void;
}

export function PostComposer({
  parentPostId,
  placeholder = "What is happening?!",
  buttonText = "Post",
  onSuccess,
}: PostComposerProps) {
  const { user, profile } = useAuth();
  const [content, setContent] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submit = useServerFn(createPost);

  if (!user || !profile) return null;

  const remaining = 280 - content.length;
  const canSubmit = content.trim().length > 0 && content.length <= 280 && !isUploading && !isSubmitting;

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setIsUploading(true);
    try {
      const uploads = Array.from(files).slice(0, 4 - mediaUrls.length);
      for (const file of uploads) {
        const path = `${user.id}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage.from("media").upload(path, file);
        if (error) throw error;
        const { data } = supabase.storage.from("media").getPublicUrl(path);
        setMediaUrls((prev) => [...prev, data.publicUrl]);
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeMedia = (index: number) => {
    setMediaUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await submit({ data: { content: content.trim(), parentPostId, mediaUrls } });
      setContent("");
      setMediaUrls([]);
      onSuccess?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="border-b border-border p-4">
      <div className="flex gap-3">
        <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-muted">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt={profile.display_name ?? profile.username} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">
              {(profile.display_name ?? profile.username).charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <div className="flex-1">
          <Textarea
            data-testid="post-composer-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={placeholder}
            rows={parentPostId ? 3 : 4}
            className="min-h-[60px] resize-none border-0 bg-transparent text-xl placeholder:text-muted-foreground focus-visible:ring-0"
          />

          {mediaUrls.length > 0 && (
            <div className={`mt-3 grid gap-2 overflow-hidden rounded-2xl ${mediaUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
              {mediaUrls.map((url, i) => (
                <div key={i} className="relative aspect-video">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button
                    onClick={() => removeMedia(i)}
                    className="absolute right-2 top-2 rounded-full bg-background/80 p-1 text-foreground hover:bg-background"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <div className="flex items-center gap-1">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={mediaUrls.length >= 4 || isUploading}
                className="rounded-full p-2 text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
              >
                <Image className="h-5 w-5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleMediaUpload}
              />
            </div>

            <div className="flex items-center gap-4">
              <span className={`text-sm ${remaining < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                {remaining < 0 ? remaining : remaining < 20 ? remaining : ""}
              </span>
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="rounded-full bg-primary px-5 font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isSubmitting ? "Posting..." : buttonText}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
