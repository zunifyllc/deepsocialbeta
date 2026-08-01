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
      <div className="mx-auto flex max-w-7xl">
        <header className="fixed bottom-0 left-0 z-50 w-full md:sticky md:top-0 md:h-screen md:w-20 lg:w-64 xl:w-72">
          <Sidebar />
          <MobileNav />
        </header>

        <main className="flex min-h-screen flex-1 flex-col border-x border-border md:ml-20 lg:ml-64 xl:ml-72">
          {children}
        </main>

        {!hideRightSidebar && (
          <aside className="sticky top-0 hidden h-screen w-80 flex-col gap-4 p-4 lg:flex xl:w-96">
            <RightSidebar />
          </aside>
        )}
      </div>
    </div>
  );
}
