import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startConversation } from "@/lib/messages.functions";

export function MessageButton({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const start = useServerFn(startConversation);
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const { conversationId } = await start({ data: { userId } });
      navigate({ to: "/messages/$conversationId", params: { conversationId } });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Message"
      title="Message"
      disabled={isLoading}
      onClick={handleClick}
      data-testid="message-button"
      className="rounded-full border-border bg-transparent text-foreground hover:bg-accent"
    >
      <Mail className="h-5 w-5" />
    </Button>
  );
}
