import { useEffect, useState } from "react";
import { Repeat2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toggleRepost, getRepostStatus } from "@/lib/reposts.functions";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface RepostButtonProps {
  postId: string;
  initialCount: number;
  onQuote: () => void;
  onChange?: () => void;
}

export function RepostButton({ postId, initialCount, onQuote, onChange }: RepostButtonProps) {
  const { user } = useAuth();
  const [isReposted, setIsReposted] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [isLoading, setIsLoading] = useState(false);
  const toggle = useServerFn(toggleRepost);
  const getStatus = useServerFn(getRepostStatus);

  useEffect(() => {
    if (!user) return;
    let active = true;
    getStatus({ data: { postId } })
      .then((res) => {
        if (!active) return;
        setIsReposted(res.isReposted);
        setCount(res.repostCount);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user, postId]);

  const handleRepost = async () => {
    if (!user || isLoading) return;
    setIsLoading(true);
    try {
      const result = await toggle({ data: { postId } });
      setIsReposted(result.isReposted);
      setCount(result.repostCount);
      onChange?.();
    } finally {
      setIsLoading(false);
    }
  };

  const trigger = (
    <button
      data-testid="repost-button"
      disabled={!user || isLoading}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className={`group flex items-center gap-2 transition-colors ${
        isReposted ? "text-green-500" : "hover:text-green-500"
      }`}
    >
      <div className={`rounded-full p-2 ${isReposted ? "bg-green-500/10" : "group-hover:bg-green-500/10"}`}>
        <Repeat2 className="h-4 w-4" />
      </div>
      <span className="text-sm">{count > 0 ? count : ""}</span>
    </button>
  );

  if (!user) return trigger;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem data-testid="repost-action" onSelect={() => void handleRepost()}>
          <Repeat2 className="mr-2 h-4 w-4" />
          {isReposted ? "Undo repost" : "Repost"}
        </DropdownMenuItem>
        <DropdownMenuItem data-testid="quote-action" onSelect={() => onQuote()}>
          <Repeat2 className="mr-2 h-4 w-4" />
          Quote repost
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
