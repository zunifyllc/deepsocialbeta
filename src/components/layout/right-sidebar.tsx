import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";

export function RightSidebar() {
  const [query, setQuery] = useState("");
  const { user } = useAuth();

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim()) {
              window.location.href = `/search?q=${encodeURIComponent(query.trim())}`;
            }
          }}
          className="rounded-full border-border bg-muted pl-10 text-foreground placeholder:text-muted-foreground focus-visible:ring-primary"
        />
      </div>

      <div className="rounded-2xl border border-border bg-muted/30 p-4">
        <h2 className="mb-4 text-xl font-extrabold">Subscribe to Premium</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Subscribe to unlock new features and if eligible, receive a share of ads revenue.
        </p>
        <button className="rounded-full bg-primary px-4 py-2 font-bold text-primary-foreground transition-opacity hover:opacity-90">
          Subscribe
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-muted/30 p-4">
        <h2 className="mb-4 text-xl font-extrabold">Trending for you</h2>
        <div className="flex flex-col gap-4">
          {["Technology", "Design", "Programming", "AI"].map((topic) => (
            <Link key={topic} to="/explore" className="flex flex-col gap-0.5 transition-colors hover:bg-accent/50">
              <span className="text-xs text-muted-foreground">{topic} · Trending</span>
              <span className="font-bold">#{topic.toLowerCase()}</span>
            </Link>
          ))}
        </div>
      </div>

      {user && <WhoToFollow />}
    </div>
  );
}

function WhoToFollow() {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-4">
      <h2 className="mb-4 text-xl font-extrabold">Who to follow</h2>
      <div className="flex flex-col gap-4">
        {[
          { name: "Tech Insider", handle: "techinsider" },
          { name: "Design Daily", handle: "designdaily" },
        ].map((account) => (
          <div key={account.handle} className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="h-10 w-10 flex-shrink-0 rounded-full bg-muted" />
              <div className="min-w-0 flex-col">
                <span className="truncate font-bold">{account.name}</span>
                <span className="truncate text-sm text-muted-foreground">@{account.handle}</span>
              </div>
            </div>
            <button className="flex-shrink-0 rounded-full bg-foreground px-3 py-1.5 text-sm font-bold text-background transition-opacity hover:opacity-90">
              Follow
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
