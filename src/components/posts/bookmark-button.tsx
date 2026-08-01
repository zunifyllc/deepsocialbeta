import { useState } from "react";
import { Bookmark } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toggleBookmark, getBookmarkStatus } from "@/lib/bookmarks.functions";
import { useAuth } from "@/hooks/use-auth";

interface BookmarkButtonProps {
  postId: string;
  onChange?: () => void;
}

export function BookmarkButton({ postId, onChange }: BookmarkButtonProps) {
  const { user } = useAuth();
  const [bookmarked, setBookmarked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const toggle = useServerFn(toggleBookmark);
  const getStatus = useServerFn(getBookmarkStatus);

  // Load initial status once when user is available
  useState(() => {
    if (!user) return;
    getStatus({ data: { postId } }).then((res) => setBookmarked(res.isBookmarked));
  });

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user || isLoading) return;
    setIsLoading(true);
    try {
      const result = await toggle({ data: { postId } });
      setBookmarked(result.isBookmarked);
      onChange?.();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      data-testid="bookmark-button"
      aria-label={bookmarked ? "Remove bookmark" : "Bookmark post"}
      onClick={handleClick}
      disabled={!user || isLoading}
      className={`group flex items-center gap-2 transition-colors ${
        bookmarked ? "text-primary" : "hover:text-primary"
      }`}
    >
      <div className={`rounded-full p-2 ${bookmarked ? "bg-primary/10" : "group-hover:bg-primary/10"}`}>
        <Bookmark className={`h-4 w-4 ${bookmarked ? "fill-current" : ""}`} />
      </div>
    </button>
  );
}
