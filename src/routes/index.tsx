import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/")({
  staticData: { sitemap: false },
  beforeLoad: async () => {
    if (typeof window === "undefined") throw redirect({ to: "/auth" });
    const { data } = await authClient.getSession();
    if (data?.user) throw redirect({ to: "/home" });
    throw redirect({ to: "/auth" });
  },
});
