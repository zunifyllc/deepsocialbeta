import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isAdmin, listUsers, setVerified } from "./admin-helpers";
export type { AdminUserRow } from "./admin-helpers";

export const getMyAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({ isAdmin: await isAdmin(context.supabase, context.userId) }));

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
  .handler(({ data, context }) =>
    listUsers(context.supabase, context.userId, {
      search: data.search,
      page: data.page,
      pageSize: data.pageSize,
    }),
  );

export const verifyUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(({ data, context }) => setVerified(context.supabase, context.userId, data.userId, true));

export const unverifyUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(({ data, context }) => setVerified(context.supabase, context.userId, data.userId, false));
