import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useMediaUrls } from "@/lib/media";

interface MediaGridProps {
  media: string[];
}

/** Renders post images in an X-style grid with a full-screen lightbox. */
export function MediaGrid({ media }: MediaGridProps) {
  const urls = useMediaUrls(media);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (media.length === 0) return null;

  return (
    <>
      <div
        className={`mt-3 grid gap-0.5 overflow-hidden rounded-2xl border border-border ${getGridClass(media.length)}`}
      >
        {urls.map((url, i) => (
          <button
            key={i}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpenIndex(i);
            }}
            className={`relative overflow-hidden bg-muted ${media.length === 1 ? "aspect-video" : "h-full min-h-32"}`}
          >
            {url ? (
              <img src={url} alt={`Post image ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full animate-pulse bg-muted" />
            )}
          </button>
        ))}
      </div>

      <Dialog open={openIndex !== null} onOpenChange={(open) => !open && setOpenIndex(null)}>
        <DialogContent className="max-w-4xl border-0 bg-transparent p-0 shadow-none">
          {openIndex !== null && urls[openIndex] && (
            <img
              src={urls[openIndex]}
              alt={`Post image ${openIndex + 1} enlarged`}
              className="max-h-[85vh] w-full rounded-xl object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function getGridClass(count: number) {
  if (count === 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-2 grid-rows-1";
  if (count === 3) return "grid-cols-2 grid-rows-2 [&>*:first-child]:row-span-2";
  return "grid-cols-2 grid-rows-2";
}
