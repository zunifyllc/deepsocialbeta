import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AdminUserRow } from "./admin-helpers";
export type { AdminUserRow } from "./admin-helpers";

export const getMyAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { hasAdminRole } = await import("./neon/features.server");
    return { isAdmin: await hasAdminRole(context.userId) };
  });

export const getAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z
      .object({
        search: z.string().max(50).optional(),
        page: z.number().int().min(0).default(0),
        pageSize: z.number().int().min(1).max(50).default(25),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { hasAdminRole, listUsersNeon } = await import("./neon/features.server");
    if (!(await hasAdminRole(context.userId))) throw new Error("Admins only");
    return (await listUsersNeon(data)) as unknown as import("./admin-helpers").AdminUserRow[];
  });

export const verifyUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { hasAdminRole } = await import("./neon/features.server");
    if (!(await hasAdminRole(context.userId))) throw new Error("Admins only");
    const W = await import("./neon/writes.server");
    return (await W.setVerified(data.userId, true)) as unknown as AdminUserRow;
  });

export const unverifyUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { hasAdminRole } = await import("./neon/features.server");
    if (!(await hasAdminRole(context.userId))) throw new Error("Admins only");
    const W = await import("./neon/writes.server");
    return (await W.setVerified(data.userId, false)) as unknown as AdminUserRow;
  });
