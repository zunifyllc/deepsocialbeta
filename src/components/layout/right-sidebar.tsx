import { SearchBox } from "@/components/search/search-box";
import { TrendingPanel } from "@/components/layout/trending-panel";
import { useAuth } from "@/hooks/use-auth";


export function RightSidebar() {
  const { user } = useAuth();

  return (
    <div className="flex flex-col gap-4">
      <SearchBox />

      <div className="rounded-2xl border border-border bg-muted/30 p-4">
        <h2 className="mb-4 text-xl font-extrabold">Subscribe to Premium</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Subscribe to unlock new features and if eligible, receive a share of ads revenue.
        </p>
        <button className="rounded-full bg-primary px-4 py-2 font-bold text-primary-foreground transition-opacity hover:opacity-90">
          Subscribe
        </button>
      </div>

      <TrendingPanel />


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
