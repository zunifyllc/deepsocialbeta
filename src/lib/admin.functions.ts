import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface AdminUserRow {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  created_at: string;
}

/** Throws unless the caller holds the `admin` role in user_roles. */
async function assertAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw error;
  if (!data) throw new Error("Admins only");
}

export const getMyAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw error;
    return { isAdmin: Boolean(data) };
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
    await assertAdmin(context.supabase, context.userId);

    const from = data.page * data.pageSize;
    let query = context.supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, is_verified, created_at")
      .order("created_at", { ascending: false })
      .range(from, from + data.pageSize - 1);

    const term = data.search?.trim();
    if (term) {
      query = query.or(`username.ilike.%${term}%,display_name.ilike.%${term}%`);
    }

    const { data: rows, error } = await query;
    if (error) throw error;
    return (rows ?? []) as unknown as AdminUserRow[];
  });

const setVerified = async (
  supabase: SupabaseClient<Database>,
  callerId: string,
  userId: string,
  value: boolean,
) => {
  await assertAdmin(supabase, callerId);
  const { data, error } = await supabase
    .from("profiles")
    .update({ is_verified: value })
    .eq("id", userId)
    .select("id, username, display_name, avatar_url, is_verified, created_at")
    .single();
  if (error) throw error;
  return data as unknown as AdminUserRow;
};

export const verifyUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(({ data, context }) => setVerified(context.supabase, context.userId, data.userId, true));

export const unverifyUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(({ data, context }) => setVerified(context.supabase, context.userId, data.userId, false));
