import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface MessageComposerProps {
  onSend: (content: string) => Promise<void> | void;
  disabled?: boolean;
}

export function MessageComposer({ onSend, disabled }: MessageComposerProps) {
  const [value, setValue] = useState("");
  const [isSending, setIsSending] = useState(false);

  const submit = async () => {
    const content = value.trim();
    if (!content || isSending) return;
    setIsSending(true);
    try {
      await onSend(content);
      setValue("");
    } catch (error) {
      // Keep the draft so users can retry after an interruption. Expected
      // permission errors (including blocks) should not surface as uncaught
      // promise rejections from the form submit event.
      toast.error(error instanceof Error ? error.message : "Could not send message");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <form
      className="flex items-end gap-2 border-t border-border bg-background p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Start a new message"
        maxLength={2000}
        disabled={disabled}
        data-testid="message-input"
        className="min-h-11 flex-1 rounded-full bg-muted px-4 py-2.5 text-[15px] outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
      />
      <Button
        type="submit"
        size="icon"
        disabled={disabled || isSending || value.trim().length === 0}
        data-testid="message-send"
        className="h-11 w-11 shrink-0 rounded-full"
      >
        <Send className="h-5 w-5" />
      </Button>
    </form>
  );
}
