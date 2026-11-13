import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { deleteOwnUploadThingMedia, getMyUnusedUploadThingMedia } from "@/lib/storage.functions";

type UnusedUpload = { url: string; purpose: string; created_at: string };

export function UnusedUploads() {
  const listUnused = useServerFn(getMyUnusedUploadThingMedia);
  const removeUnused = useServerFn(deleteOwnUploadThingMedia);
  const [items, setItems] = useState<UnusedUpload[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    listUnused({}).then((rows) => {
      if (active) setItems(rows);
    }).catch(() => {
      if (active) setError("Could not load unused media.");
    });
    return () => { active = false; };
  }, [listUnused]);

  if (items.length === 0 && !error) return null;

  const handleRemove = async (url: string) => {
    if (!window.confirm("Permanently delete this unused image?")) return;
    setBusy(url);
    setError("");
    try {
      await removeUnused({ data: { url } });
      setItems((current) => current.filter((item) => item.url !== url));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete image.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-border p-4" aria-labelledby="unused-uploads-heading">
      <h2 id="unused-uploads-heading" className="text-lg font-semibold">Unused uploads</h2>
      <p className="text-sm text-muted-foreground">
        Images uploaded more than a minute ago that are not attached to a post or your profile.
        Deleting these frees up storage. Files in use cannot be deleted here.
      </p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {items.map((item) => (
        <div key={item.url} className="flex items-center gap-3 rounded-lg border border-border p-2">
          <img src={item.url} alt="Unused uploaded image" className="h-14 w-14 rounded-lg bg-muted object-cover" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium capitalize">{item.purpose === "media" ? "Post image" : item.purpose}</p>
            <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void handleRemove(item.url)}
            aria-label="Delete unused image"
          >
            {busy === item.url ? "Deleting..." : "Delete"}
          </Button>
        </div>
      ))}
    </section>
  );
}
