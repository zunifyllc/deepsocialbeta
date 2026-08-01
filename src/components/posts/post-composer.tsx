import { useState, useRef, useEffect } from "react";
import { Image as ImageIcon, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { createPost } from "@/lib/posts.functions";
import {
  ALLOWED_MEDIA_TYPES,
  MAX_MEDIA_PER_POST,
  deleteMediaFile,
  uploadMediaFile,
  validateMediaFile,
} from "@/lib/media";

interface PostComposerProps {
  parentPostId?: string;
  placeholder?: string;
  buttonText?: string;
  onSuccess?: () => void;
}

interface MediaItem {
  /** Local object URL used for instant preview. */
  previewUrl: string;
  /** Storage path once the upload finishes. */
  path?: string;
  uploading: boolean;
}

export function PostComposer({
  parentPostId,
  placeholder = "What is happening?!",
  buttonText = "Post",
  onSuccess,
}: PostComposerProps) {
  const { user, profile } = useAuth();
  const [content, setContent] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submit = useServerFn(createPost);

  useEffect(() => {
    return () => {
      media.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user || !profile) return null;

  const isUploading = media.some((item) => item.uploading);
  const remaining = 280 - content.length;
  const canSubmit = content.trim().length > 0 && content.length <= 280 && !isUploading && !isSubmitting;

  const addFiles = async (fileList: FileList | File[]) => {
    setError(null);
    const files = Array.from(fileList);
    const slots = MAX_MEDIA_PER_POST - media.length;
    if (slots <= 0) {
      setError(`You can attach up to ${MAX_MEDIA_PER_POST} images per post.`);
      return;
    }
    if (files.length > slots) {
      setError(`You can attach up to ${MAX_MEDIA_PER_POST} images per post.`);
    }

    for (const file of files.slice(0, slots)) {
      const problem = validateMediaFile(file);
      if (problem) {
        setError(problem);
        continue;
      }
      const previewUrl = URL.createObjectURL(file);
      setMedia((prev) => [...prev, { previewUrl, uploading: true }]);
      try {
        const path = await uploadMediaFile(file, user.id);
        setMedia((prev) =>
          prev.map((item) => (item.previewUrl === previewUrl ? { ...item, path, uploading: false } : item)),
        );
      } catch {
        setError(`${file.name}: upload failed. Please try again.`);
        setMedia((prev) => prev.filter((item) => item.previewUrl !== previewUrl));
        URL.revokeObjectURL(previewUrl);
      }
    }
  };

  const removeMedia = async (previewUrl: string) => {
    const item = media.find((m) => m.previewUrl === previewUrl);
    setMedia((prev) => prev.filter((m) => m.previewUrl !== previewUrl));
    URL.revokeObjectURL(previewUrl);
    if (item?.path) await deleteMediaFile(item.path);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const mediaUrls = media.map((item) => item.path).filter((p): p is string => Boolean(p));
      await submit({ data: { content: content.trim(), parentPostId, mediaUrls } });
      media.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      setContent("");
      setMedia([]);
      setError(null);
      onSuccess?.();
    } catch {
      setError("Could not publish your post. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={`border-b border-border p-4 transition-colors ${isDragging ? "bg-primary/5 ring-2 ring-inset ring-primary" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files.length > 0) void addFiles(e.dataTransfer.files);
      }}
    >
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
            placeholder={isDragging ? "Drop images to attach" : placeholder}
            rows={parentPostId ? 3 : 4}
            className="min-h-[60px] resize-none border-0 bg-transparent text-xl placeholder:text-muted-foreground focus-visible:ring-0"
          />

          {media.length > 0 && (
            <div
              className={`mt-3 grid gap-2 overflow-hidden rounded-2xl ${media.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}
            >
              {media.map((item) => (
                <div key={item.previewUrl} className="relative aspect-video overflow-hidden rounded-xl bg-muted">
                  <img src={item.previewUrl} alt="Attached image preview" className="h-full w-full object-cover" />
                  {item.uploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                      <Loader2 className="h-5 w-5 animate-spin text-foreground" />
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label="Remove image"
                    onClick={() => void removeMedia(item.previewUrl)}
                    className="absolute right-2 top-2 rounded-full bg-background/80 p-1 text-foreground hover:bg-background"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Add images"
                onClick={() => fileInputRef.current?.click()}
                disabled={media.length >= MAX_MEDIA_PER_POST}
                className="rounded-full p-2 text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
              >
                <ImageIcon className="h-5 w-5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_MEDIA_TYPES.join(",")}
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) void addFiles(e.target.files);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              />
              <span className="text-xs text-muted-foreground">
                {media.length}/{MAX_MEDIA_PER_POST}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <span className={`text-sm ${remaining < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                {remaining < 20 ? remaining : ""}
              </span>
              <Button
                data-testid="post-composer-submit"
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
