import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Bookmark, Eye, Heart, MessageCircle, Repeat2 } from "lucide-react";
import { format } from "date-fns";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/app-shell";
import { RangeToggle } from "@/components/analytics/range-toggle";
import { getPostAnalytics } from "@/lib/analytics.functions";
import type { TimeRange } from "@/lib/analytics-helpers";

export const Route = createFileRoute("/_authenticated/analytics/post/$postId")({
  head: () => ({
    meta: [
      { title: "Post analytics / DeepSocial" },
      { name: "description", content: "Impressions and engagement for your post on DeepSocial." },
      { property: "og:title", content: "Post analytics / DeepSocial" },
      { property: "og:description", content: "Impressions and engagement for your post on DeepSocial." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PostAnalyticsPage,
});

const LINES = [
  { key: "impressions", label: "Impressions", color: "#1d9bf0" },
  { key: "likes", label: "Likes", color: "#f91880" },
  { key: "reposts", label: "Reposts", color: "#00ba7c" },
  { key: "replies", label: "Replies", color: "#ff7a00" },
  { key: "bookmarks", label: "Bookmarks", color: "#ffd400" },
];

function PostAnalyticsPage() {
  const { postId } = Route.useParams();
  const [range, setRange] = useState<TimeRange>("30d");
  const fetchAnalytics = useServerFn(getPostAnalytics);
  const { data, isLoading, error } = useQuery({
    queryKey: ["post-analytics", postId, range],
    queryFn: () => fetchAnalytics({ data: { postId, range } }),
    retry: false,
  });

  return (
    <AppShell>
      <div className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 px-4 py-2 backdrop-blur-md">
        <Link to="/post/$postId" params={{ postId }} className="rounded-full p-2 transition-colors hover:bg-accent">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">Post analytics</h1>
      </div>

      {error && (
        <div className="p-8 text-center text-muted-foreground">
          <p className="text-xl font-bold">Not available</p>
          <p className="mt-2">You can only view analytics for your own posts.</p>
        </div>
      )}

      {isLoading && !error && <div className="p-8 text-center text-muted-foreground">Loading analytics…</div>}

      {data && (
        <div className="space-y-6 p-4">
          <div className="rounded-2xl border border-border p-4">
            <p className="line-clamp-3 whitespace-pre-wrap text-[15px]">{data.post.content}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Posted {format(new Date(data.post.created_at), "PPp")}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard icon={<Eye className="h-4 w-4" />} label="Impressions" value={data.totals.impressions} />
            <StatCard icon={<Heart className="h-4 w-4" />} label="Likes" value={data.totals.likes} />
            <StatCard icon={<Repeat2 className="h-4 w-4" />} label="Reposts" value={data.totals.reposts} />
            <StatCard icon={<MessageCircle className="h-4 w-4" />} label="Replies" value={data.totals.replies} />
            <StatCard icon={<Bookmark className="h-4 w-4" />} label="Bookmarks" value={data.totals.bookmarks} />
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Engagement over time</h2>
              <RangeToggle value={range} onChange={setRange} />
            </div>

            {data.dailyTimeline.length === 0 ? (
              <div className="rounded-2xl border border-border p-8 text-center text-muted-foreground">
                No activity in this period yet.
              </div>
            ) : (
              <div className="h-80 rounded-2xl border border-border p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.dailyTimeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="currentColor" fontSize={12} />
                    <YAxis allowDecimals={false} stroke="currentColor" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 12,
                      }}
                    />
                    <Legend />
                    {LINES.map((l) => (
                      <Line
                        key={l.key}
                        type="monotone"
                        dataKey={l.key}
                        name={l.label}
                        stroke={l.color}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1 text-2xl font-bold">{value.toLocaleString()}</p>
    </div>
  );
}
