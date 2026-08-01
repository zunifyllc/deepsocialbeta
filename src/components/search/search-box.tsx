import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchAll, type SearchResults } from "@/lib/search.functions";

const EMPTY: SearchResults = { users: [], posts: [] };

export function SearchBox({ initialQuery = "" }: { initialQuery?: string }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults(EMPTY);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const timer = setTimeout(() => {
      let cancelled = false;
      searchAll({ data: { query: term } })
        .then((res) => {
          if (!cancelled) setResults(res);
        })
        .catch(() => setResults(EMPTY))
        .finally(() => setIsLoading(false));
      return () => {
        cancelled = true;
      };
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const hasResults = results.users.length > 0 || results.posts.length > 0;
  const showDropdown = open && query.trim().length > 0;

  return (
    <div ref={containerRef} className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        data-testid="search-input"
        placeholder="Search"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && query.trim()) {
            setOpen(false);
            navigate({ to: "/search", search: { q: query.trim(), tab: "top" } });
          }
          if (e.key === "Escape") setOpen(false);
        }}
        className="rounded-full border-border bg-muted pl-10 text-foreground placeholder:text-muted-foreground focus-visible:ring-primary"
      />

      {showDropdown && (
        <div
          data-testid="search-dropdown"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-border bg-background shadow-xl"
        >
          {isLoading && !hasResults && (
            <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          )}

          {!isLoading && !hasResults && (
            <p className="p-4 text-sm text-muted-foreground">No results for “{query.trim()}”</p>
          )}

          {results.users.length > 0 && (
            <div className="border-b border-border py-2">
              <p className="px-4 pb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">People</p>
              {results.users.map((u) => (
                <Link
                  key={u.id}
                  to="/$username"
                  params={{ username: u.username }}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-accent/50"
                >
                  <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-muted">
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

          {results.posts.length > 0 && (
            <div className="py-2">
              <p className="px-4 pb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Posts</p>
              {results.posts.map((p) => (
                <Link
                  key={p.id}
                  to="/post/$postId"
                  params={{ postId: p.id }}
                  onClick={() => setOpen(false)}
                  className="block px-4 py-2 transition-colors hover:bg-accent/50"
                >
                  <p className="truncate text-sm font-semibold">
                    {p.author?.display_name ?? p.author?.username ?? "Unknown"}
                  </p>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{p.content}</p>
                </Link>
              ))}
            </div>
          )}

          {hasResults && (
            <button
              onClick={() => {
                setOpen(false);
                navigate({ to: "/search", search: { q: query.trim(), tab: "top" } });
              }}
              className="w-full border-t border-border px-4 py-3 text-left text-sm font-semibold text-primary transition-colors hover:bg-accent/50"
            >
              See all results for “{query.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
