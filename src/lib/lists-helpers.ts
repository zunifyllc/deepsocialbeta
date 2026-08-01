import { z } from "zod";

export interface ListMember {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified?: boolean;
}

export interface UserList {
  id: string;
  creator_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  member_count?: number;
  creator?: ListMember | null;
}

export const LIST_WITH_CREATOR = `
  id,
  creator_id,
  name,
  description,
  is_public,
  created_at,
  updated_at,
  creator:profiles!lists_creator_id_fkey(id, username, display_name, avatar_url, is_verified)
`;

export const createListSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(200).optional(),
  isPublic: z.boolean().default(false),
});

export const updateListSchema = z.object({
  listId: z.string().uuid(),
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(200).nullable().optional(),
  isPublic: z.boolean().optional(),
});

export const listIdSchema = z.object({ listId: z.string().uuid() });

export const listMemberSchema = z.object({
  listId: z.string().uuid(),
  userId: z.string().uuid(),
});

export const listFeedSchema = z.object({
  listId: z.string().uuid(),
  limit: z.number().min(1).max(50).default(20),
  cursor: z.string().datetime().optional(),
});

export const userIdSchema = z.object({ userId: z.string().uuid() });
