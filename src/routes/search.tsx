import { createFileRoute } from "@tanstack/react-router";
import { useSearch } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { Search } from "lucide-react";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Search / X Clone" },
      { name: "description", content: "Search X Clone." },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const search = useSearch({ from: "/search" });
  const query = (search as { q?: string }).q ?? "";

  return (
    <AppShell>
      <div className="sticky top-0 z-10 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md">
        <h1 className="text-xl font-bold">Search</h1>
      </div>
      <div className="flex h-[calc(100vh-120px)] flex-col items-center justify-center px-4 text-center text-muted-foreground">
        <Search className="h-12 w-12" />
        <p className="mt-4 text-2xl font-bold text-foreground">
          {query ? `No results for "${query}"` : "Search X Clone"}
        </p>
        <p className="mt-2 max-w-sm">Full search is coming soon. Try Explore to discover posts.</p>
      </div>
    </AppShell>
  );
}
