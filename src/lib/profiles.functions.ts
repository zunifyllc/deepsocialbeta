import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createPublicClient } from "./supabase-public";

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  created_at: string;
  updated_at: string;
}

const profileSchema = z.object({
  display_name: z.string().max(50).optional(),
  bio: z.string().max(160).optional(),
  location: z.string().max(30).optional(),
  website: z.string().max(100).optional(),
  avatar_url: z.string().url().optional(),
  banner_url: z.string().url().optional(),
});

export const getProfileByUsername = createServerFn({ method: "GET" })
  .validator((input) => z.object({ username: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const supabase = createPublicClient();
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("username", data.username)
      .maybeSingle();
    if (error) throw error;
    return (profile ?? null) as unknown as Profile | null;
  });

export const getCurrentProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile, error } = await context.supabase
      .from("profiles")
      .select("*")
      .eq("id", context.userId)
      .single();
    if (error) throw error;
    return profile as unknown as Profile;
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => profileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const update = {
      display_name: data.display_name ?? null,
      bio: data.bio ?? null,
      location: data.location ?? null,
      website: data.website ?? null,
      avatar_url: data.avatar_url ?? null,
      banner_url: data.banner_url ?? null,
    };
    const { data: profile, error } = await context.supabase
      .from("profiles")
      .update(update)
      .eq("id", context.userId)
      .select()
      .single();
    if (error) throw error;
    return profile as unknown as Profile;
  });
