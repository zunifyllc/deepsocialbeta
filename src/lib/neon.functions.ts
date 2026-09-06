import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin-only connectivity check for the future Neon database.
 * No app feature depends on this; it exists to verify configuration.
 */
export const checkNeonStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const { hasNeonDatabase, checkNeonConnection, checkNeonSchema } = await import(
      "./neon.server"
    );
    if (!hasNeonDatabase()) return { configured: false, ok: false as boolean };
    const result = await checkNeonConnection();
    const schema = await checkNeonSchema();
    return { configured: true, ...result, schema };
  });
