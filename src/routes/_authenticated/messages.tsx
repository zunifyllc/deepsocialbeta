import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/messages")({
  staticData: { sitemap: false },
  component: () => <Outlet />,
});
