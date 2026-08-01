import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { POLL_DURATIONS } from "@/lib/poll-helpers";

export interface PollDraft {
  options: string[];
  durationHours: number | null;
}

interface PollComposerProps {
  draft: PollDraft;
  onChange: (draft: PollDraft) => void;
  onRemove: () => void;
}

export function PollComposer({ draft, onChange, onRemove }: PollComposerProps) {
  const setOption = (index: number, value: string) => {
    const options = [...draft.options];
    options[index] = value;
    onChange({ ...draft, options });
  };

  return (
    <div className="mt-3 space-y-2 rounded-2xl border border-border p-3" data-testid="poll-composer">
      {draft.options.map((option, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            value={option}
            maxLength={80}
            placeholder={`Choice ${index + 1}${index > 1 ? " (optional)" : ""}`}
            onChange={(e) => setOption(index, e.target.value)}
            className="rounded-md"
          />
          {draft.options.length > 2 && (
            <button
              type="button"
              aria-label={`Remove choice ${index + 1}`}
              onClick={() =>
                onChange({ ...draft, options: draft.options.filter((_, i) => i !== index) })
              }
              className="rounded-full p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}

      {draft.options.length < 4 && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => onChange({ ...draft, options: [...draft.options, ""] })}
          className="h-8 px-2 text-sm text-primary hover:bg-primary/10"
        >
          + Add choice
        </Button>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
        <label className="text-sm text-muted-foreground" htmlFor="poll-duration">
          Poll length
        </label>
        <select
          id="poll-duration"
          value={String(draft.durationHours)}
          onChange={(e) =>
            onChange({
              ...draft,
              durationHours: e.target.value === "null" ? null : Number(e.target.value),
            })
          }
          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
        >
          {POLL_DURATIONS.map((d) => (
            <option key={d.label} value={String(d.hours)}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <Button
        type="button"
        variant="ghost"
        onClick={onRemove}
        className="h-8 w-full text-sm text-destructive hover:bg-destructive/10"
      >
        Remove poll
      </Button>
    </div>
  );
}
