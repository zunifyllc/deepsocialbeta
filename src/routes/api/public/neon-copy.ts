// TEMPORARY dev-only trigger for the Neon data copy. Disabled outside dev.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/neon-copy")({
  server: {
    handlers: {
      POST: async () => {
        if (!import.meta.env.DEV) return new Response("Not found", { status: 404 });
        const { runDataCopy } = await import("@/lib/neon/data-copy.server");
        return Response.json(await runDataCopy());
      },
    },
  },
});
