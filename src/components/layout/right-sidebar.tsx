import { SearchBox } from "@/components/search/search-box";
import { TrendingPanel } from "@/components/layout/trending-panel";

export function RightSidebar() {
  return (
    <div className="flex flex-col gap-4">
      <SearchBox />
      <TrendingPanel />
    </div>
  );
}
