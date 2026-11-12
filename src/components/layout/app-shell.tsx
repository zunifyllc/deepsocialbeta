import { type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { RightSidebar } from "./right-sidebar";
import { MobileNav } from "./mobile-nav";

interface AppShellProps {
  children: ReactNode;
  hideRightSidebar?: boolean;
}

export function AppShell({ children, hideRightSidebar = false }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px]">
        {/* The desktop rail occupies its own flex column. Never offset main
            again with margin-left: that used to double-count the sidebar. */}
        <header className="fixed bottom-0 left-0 z-50 w-full shrink-0 md:sticky md:top-0 md:h-screen md:w-20 lg:w-60 xl:w-64">
          <Sidebar />
          <MobileNav />
        </header>

        <main id="main-content" className="min-w-0 flex-1 border-x border-border pb-16 md:pb-0">
          {children}
        </main>

        {!hideRightSidebar && (
          <aside className="sticky top-0 hidden h-screen w-80 shrink-0 overflow-y-auto p-5 2xl:block">
            <RightSidebar />
          </aside>
        )}
      </div>
    </div>
  );
}
