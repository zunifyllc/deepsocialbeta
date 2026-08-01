import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toggleFollow, getFollowStatus } from "@/lib/follows.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

interface FollowButtonProps {
  userId: string;
}

export function FollowButton({ userId }: FollowButtonProps) {
  const { user } = useAuth();
  const [following, setFollowing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const toggle = useServerFn(toggleFollow);
  const getStatus = useServerFn(getFollowStatus);

  useEffect(() => {
    if (!user) return;
    getStatus({ data: { followingId: userId } }).then((res) => setFollowing(res.following));
  }, [user, userId, getStatus]);

  if (!user || user.id === userId) return null;

  const handleClick = async () => {
    setIsLoading(true);
    try {
      const result = await toggle({ data: { followingId: userId } });
      setFollowing(result.following);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleClick}
      disabled={isLoading}
      variant={following ? "outline" : "default"}
      className={`rounded-full px-5 font-bold ${
        following
          ? "border-border bg-transparent text-foreground hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
          : "bg-foreground text-background hover:bg-foreground/90"
      }`}
    >
      {isLoading ? "..." : following ? "Following" : "Follow"}
    </Button>
  );
}
