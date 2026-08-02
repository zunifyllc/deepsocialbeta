import { useState } from "react";
import { Heart } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toggleLike, getLikeStatus } from "@/lib/likes.functions";
import { useAuth } from "@/hooks/use-auth";

interface LikeButtonProps {
  postId: string;
  initialLikes: number;
}

export function LikeButton({ postId, initialLikes }: LikeButtonProps) {
  const { user } = useAuth();
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(initialLikes);
  const [isLoading, setIsLoading] = useState(false);
  const toggle = useServerFn(toggleLike);
  const getStatus = useServerFn(getLikeStatus);

  // Load initial status once when user is available
  useState(() => {
    if (!user) return;
    getStatus({ data: { postId } }).then((res) => setLiked(res.liked));
  });

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user || isLoading) return;
    setIsLoading(true);
    try {
      const result = await toggle({ data: { postId } });
      setLiked(result.liked);
      setLikes((prev) => (result.liked ? prev + 1 : Math.max(prev - 1, 0)));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      data-testid="like-button"
      onClick={handleClick}
      disabled={!user || isLoading}
      className={`group flex items-center gap-2 transition-colors ${
        liked ? "text-primary" : "hover:text-primary"
      }`}
    >
      <div className={`rounded-full p-2 ${liked ? "bg-primary/10" : "group-hover:bg-primary/10"}`}>
        <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
      </div>
      <span className="text-sm">{likes > 0 ? likes : ""}</span>
    </button>
  );
}
