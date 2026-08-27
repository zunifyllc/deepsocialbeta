import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Users } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/app-shell";
import { RangeToggle } from "@/components/analytics/range-toggle";
import { getProfileAnalytics } from "@/lib/analytics.functions";
import type { TimeRange } from "@/lib/analytics-helpers";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/analytics/profile/$username")({
  head: () => ({
    meta: [
      { title: "Profile analytics / DeepSocial" },
      { name: "description", content: "Profile visits over time on DeepSocial." },
      { property: "og:title", content: "Profile analytics / DeepSocial" },
      { property: "og:description", content: "Profile visits over time on DeepSocial." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfileAnalyticsPage,
});

function ProfileAnalyticsPage() {
  const { username } = Route.useParams();
  const { profile } = useAuth();
  const [range, setRange] = useState<TimeRange>("30d");
  const fetchAnalytics = useServerFn(getProfileAnalytics);
  const isOwner = !profile || profile.username === username;
  const { data, isLoading, error } = useQuery({
    queryKey: ["profile-analytics", range],
    queryFn: () => fetchAnalytics({ data: { range } }),
    retry: false,
    enabled: isOwner,
  });

  return (
    <AppShell>
      <div className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 px-4 py-2 backdrop-blur-md">
        <Link to="/$username" params={{ username }} className="rounded-full p-2 transition-colors hover:bg-accent">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">Profile analytics</h1>
      </div>

      {(!isOwner || error) && (
        <div className="p-8 text-center text-muted-foreground">
          <p className="text-xl font-bold">Not available</p>
          <p className="mt-2">You can only view analytics for your own profile.</p>
        </div>
      )}

      {isOwner && isLoading && !error && (
        <div className="p-8 text-center text-muted-foreground">Loading analytics…</div>
      )}

      {isOwner && data && (
        <div className="space-y-6 p-4">
          <div className="rounded-2xl border border-border p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>Total profile visits</span>
            </div>
            <p className="mt-1 text-3xl font-bold">{data.totalVisits.toLocaleString()}</p>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Visits over time</h2>
              <RangeToggle value={range} onChange={setRange} />
            </div>

            {data.dailyTimeline.length === 0 ? (
              <div className="rounded-2xl border border-border p-8 text-center text-muted-foreground">
                No visits in this period yet.
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
                    <Line type="monotone" dataKey="visits" name="Visits" stroke="#1d9bf0" strokeWidth={2} dot={false} />
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
