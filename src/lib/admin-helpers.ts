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

export const ADMIN_USER_COLUMNS = "id, username, display_name, avatar_url, is_verified, created_at";

type Client = SupabaseClient<Database>;

export async function isAdmin(supabase: Client, userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw error;
  return Boolean(data);
}

/** Throws unless the caller holds the `admin` role in user_roles. */
export async function assertAdmin(supabase: Client, userId: string) {
  if (!(await isAdmin(supabase, userId))) throw new Error("Admins only");
}

export async function setVerified(supabase: Client, callerId: string, userId: string, value: boolean) {
  await assertAdmin(supabase, callerId);
  const { data, error } = await supabase
    .from("profiles")
    .update({ is_verified: value })
    .eq("id", userId)
    .select(ADMIN_USER_COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as AdminUserRow;
}

export async function listUsers(
  supabase: Client,
  callerId: string,
  opts: { search?: string | undefined; page: number; pageSize: number },
) {
  await assertAdmin(supabase, callerId);
  const from = opts.page * opts.pageSize;
  let query = supabase
    .from("profiles")
    .select(ADMIN_USER_COLUMNS)
    .order("created_at", { ascending: false })
    .range(from, from + opts.pageSize - 1);

  const term = opts.search?.trim();
  if (term) query = query.or(`username.ilike.%${term}%,display_name.ilike.%${term}%`);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as AdminUserRow[];
}
