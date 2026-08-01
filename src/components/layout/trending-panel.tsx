import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getTrendingHashtags } from "@/lib/trending.functions";

export function TrendingPanel() {
  const { data: trends, isLoading } = useQuery({
    queryKey: ["trending-hashtags"],
    queryFn: () => getTrendingHashtags({ data: { limit: 10 } }),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-4">
      <h2 className="mb-4 text-xl font-extrabold">Trending for you</h2>

      {isLoading && <p className="text-sm text-muted-foreground">Loading trends…</p>}

      {!isLoading && (!trends || trends.length === 0) && (
        <p className="text-sm text-muted-foreground">
          No trends yet. Post something with a #hashtag to get things started.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {trends?.map((trend, index) => (
          <Link
            key={trend.hashtag}
            to="/explore"
            search={{ hashtag: trend.hashtag }}
            className="-mx-2 flex flex-col gap-0.5 rounded-lg px-2 py-1 transition-colors hover:bg-accent/50"
          >
            <span className="text-xs text-muted-foreground">{index + 1} · Trending</span>
            <span className="font-bold">#{trend.hashtag}</span>
            <span className="text-xs text-muted-foreground">
              {trend.post_count} {trend.post_count === 1 ? "post" : "posts"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
