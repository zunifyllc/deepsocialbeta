import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Search as SearchIcon, Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { SearchBox } from "@/components/search/search-box";
import { PostCard } from "@/components/posts/post-card";
import { searchAll } from "@/lib/search.functions";

const PAGE_SIZE = 10;
const TABS = ["top", "latest", "people"] as const;

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  tab: fallback(z.string(), "top").default("top"),
  page: fallback(z.number().int(), 0).default(0),
});

export const Route = createFileRoute("/search")({
  staticData: { sitemap: true },
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    links: [{ rel: "canonical", href: "https://deepsocialbeta.vercel.app/search" }],
    meta: [
      { property: "og:url", content: "https://deepsocialbeta.vercel.app/search" },
      { title: "Search / DeepSocial" },
      { name: "description", content: "Search posts and people across DeepSocial." },
      { property: "og:title", content: "Search / DeepSocial" },
      { property: "og:description", content: "Search posts and people across DeepSocial." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SearchPage,
  errorComponent: ({ error }) => (
    <AppShell>
      <div role="alert" className="p-8 text-center text-muted-foreground">{(error as Error).message}</div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <div className="p-8 text-center text-muted-foreground">Nothing found.</div>
    </AppShell>
  ),
});

function SearchPage() {
  const { q, tab, page } = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });

  const query = q.slice(0, 100).trim();
  const activeTab = (TABS as readonly string[]).includes(tab) ? tab : "top";
  const safePage = Math.max(0, Math.min(50, page));

  const { data, isFetching } = useQuery({
    queryKey: ["search", query, activeTab, safePage],
    queryFn: () =>
      searchAll({
        data: {
          query,
          sort: activeTab === "latest" ? "latest" : "top",
          userLimit: activeTab === "people" ? 20 : 5,
          postLimit: PAGE_SIZE,
          postOffset: activeTab === "people" ? 0 : safePage * PAGE_SIZE,
        },
      }),
    enabled: query.length > 0,
  });

  const users = data?.users ?? [];
  const posts = data?.posts ?? [];

  return (
    <AppShell>
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md">
        <h1 className="mb-3 text-xl font-bold">Search</h1>
        <SearchBox initialQuery={query} />
        <div className="mt-3 flex">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => navigate({ search: (prev: { q: string; tab: string; page: number }) => ({ ...prev, tab: t, page: 0 }) })}
              className={`relative flex-1 py-3 text-sm capitalize transition-colors hover:bg-accent/50 ${
                activeTab === t ? "font-bold text-foreground" : "text-muted-foreground"
              }`}
            >
              {t}
              {activeTab === t && (
                <div className="absolute bottom-0 left-1/2 h-1 w-14 -translate-x-1/2 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
      </div>

      {!query && (
        <div className="flex flex-col items-center justify-center px-4 py-20 text-center text-muted-foreground">
          <SearchIcon className="h-12 w-12" />
          <p className="mt-4 text-2xl font-bold text-foreground">Search DeepSocial</p>
          <p className="mt-2 max-w-sm">Find posts and people by typing in the box above.</p>
        </div>
      )}

      {query && isFetching && !data && (
        <div className="flex items-center justify-center gap-2 p-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Searching…
        </div>
      )}

      {query && data && (
        <>
          {activeTab === "people" ? (
            users.length > 0 ? (
              <div>
                {users.map((u) => (
                  <Link
                    key={u.id}
                    to="/$username"
                    params={{ username: u.username }}
                    className="flex items-center gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-muted/20"
                  >
                    <div className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-full bg-muted">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt={u.display_name ?? u.username} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center font-bold text-muted-foreground">
                          {(u.display_name ?? u.username).charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-bold">{u.display_name ?? u.username}</p>
                      <p className="truncate text-sm text-muted-foreground">@{u.username}</p>
                      {u.bio && <p className="mt-0.5 line-clamp-2 text-sm">{u.bio}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState query={query} />
            )
          ) : (
            <>
              {activeTab === "top" && users.length > 0 && (
                <div className="border-b border-border">
                  <p className="px-4 pt-3 text-lg font-bold">People</p>
                  {users.slice(0, 3).map((u) => (
                    <Link
                      key={u.id}
                      to="/$username"
                      params={{ username: u.username }}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/20"
                    >
                      <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-muted">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt={u.display_name ?? u.username} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">
                            {(u.display_name ?? u.username).charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-bold">{u.display_name ?? u.username}</p>
                        <p className="truncate text-sm text-muted-foreground">@{u.username}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {posts.length > 0 ? (
                <div>
                  {posts.map((post) => (
                    <PostCard key={post.feedKey ?? post.id} post={post} />
                  ))}
                  <div className="flex items-center justify-between p-4">
                    <button
                      disabled={safePage === 0}
                      onClick={() => navigate({ search: (prev: { q: string; tab: string; page: number }) => ({ ...prev, page: safePage - 1 }) })}
                      className="rounded-full border border-border px-4 py-2 text-sm font-semibold disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-muted-foreground">Page {safePage + 1}</span>
                    <button
                      disabled={posts.length < PAGE_SIZE}
                      onClick={() => navigate({ search: (prev: { q: string; tab: string; page: number }) => ({ ...prev, page: safePage + 1 }) })}
                      className="rounded-full border border-border px-4 py-2 text-sm font-semibold disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : (
                users.length === 0 && <EmptyState query={query} />
              )}
            </>
          )}
        </>
      )}
    </AppShell>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-20 text-center text-muted-foreground">
      <SearchIcon className="h-12 w-12" />
      <p className="mt-4 text-2xl font-bold text-foreground">No results for “{query}”</p>
      <p className="mt-2 max-w-sm">Try a different spelling or shorter keyword.</p>
    </div>
  );
}
