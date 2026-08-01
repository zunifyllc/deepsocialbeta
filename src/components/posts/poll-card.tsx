import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { getPollResults, votePoll } from "@/lib/polls.functions";
import type { PollResults } from "@/lib/poll-helpers";

interface PollCardProps {
  pollId: string;
}

export function PollCard({ pollId }: PollCardProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fetchResults = useServerFn(getPollResults);
  const vote = useServerFn(votePoll);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queryKey = ["poll", pollId, user?.id ?? "anon"];

  const { data } = useQuery<PollResults>({
    queryKey,
    queryFn: () => fetchResults({ data: { pollId, ...(user?.id ? { userId: user.id } : {}) } }),
  });

  // Live results: any vote on this poll refreshes the counts.
  useEffect(() => {
    const channel = supabase
      .channel(`poll-votes-${pollId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "poll_votes", filter: `poll_id=eq.${pollId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollId, user?.id]);

  if (!data) {
    return (
      <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading poll…
      </div>
    );
  }

  const showResults = Boolean(data.userVotedOptionId) || data.expired;
  const canVote = Boolean(user) && !data.expired;

  const handleVote = async (optionId: string) => {
    if (!canVote || pending) return;
    setPending(optionId);
    setError(null);
    try {
      const results = await vote({ data: { pollId, optionId } });
      queryClient.setQueryData(queryKey, results);
    } catch {
      setError("Could not record your vote. Please try again.");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="mt-3 space-y-2" data-testid="poll-card" onClick={(e) => e.stopPropagation()}>
      {data.options.map((option) => {
        const pct = data.totalVotes > 0 ? Math.round((option.voteCount / data.totalVotes) * 100) : 0;
        const chosen = data.userVotedOptionId === option.id;

        if (showResults) {
          return (
            <button
              key={option.id}
              type="button"
              disabled={!canVote || Boolean(pending)}
              onClick={() => void handleVote(option.id)}
              className="relative block w-full overflow-hidden rounded-md border border-border px-3 py-2 text-left text-sm disabled:cursor-default"
            >
              <span
                className={`absolute inset-y-0 left-0 ${chosen ? "bg-primary/30" : "bg-muted"}`}
                style={{ width: `${pct}%` }}
              />
              <span className="relative flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1">
                  <span className={`truncate ${chosen ? "font-bold" : ""}`}>{option.content}</span>
                  {chosen && <Check className="h-4 w-4 flex-shrink-0 text-primary" />}
                </span>
                <span className="flex-shrink-0 tabular-nums text-muted-foreground">{pct}%</span>
              </span>
            </button>
          );
        }

        return (
          <button
            key={option.id}
            type="button"
            disabled={!canVote || Boolean(pending)}
            onClick={() => void handleVote(option.id)}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-primary px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
          >
            {pending === option.id && <Loader2 className="h-4 w-4 animate-spin" />}
            <span className="truncate">{option.content}</span>
          </button>
        );
      })}

      <p className="text-sm text-muted-foreground">
        {data.totalVotes} {data.totalVotes === 1 ? "vote" : "votes"} ·{" "}
        {data.expired
          ? "Final results"
          : data.endsAt
            ? `Ends ${formatDistanceToNow(new Date(data.endsAt), { addSuffix: true })}`
            : "No end date"}
      </p>

      {!user && <p className="text-sm text-muted-foreground">Sign in to vote.</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
