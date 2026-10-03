import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  LIST_COLUMNS,
  createListSchema,
  listFeedSchema,
  listIdSchema,
  listMemberSchema,
  updateListSchema,
  userIdSchema,
  type ListMember,
  type UserList,
} from "./lists-helpers";
import type { Post } from "./posts.functions";

export const createList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => createListSchema.parse(input))
  .handler(async ({ data, context }): Promise<UserList> => {
    const { data: list, error } = await context.supabase
      .from("lists")
      .insert({
        creator_id: context.userId,
        name: data.name,
        description: data.description ?? null,
        is_public: data.isPublic,
      })
      .select(LIST_COLUMNS)
      .single();
    if (error) throw error;
    const mirror = await import("./neon/mirror.server");
    await mirror.mirrorRow(context.supabase, "lists", list as unknown as Record<string, unknown>, { userId: context.userId });
    return list as unknown as UserList;
  });

export const updateList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => updateListSchema.parse(input))
  .handler(async ({ data, context }): Promise<UserList> => {
    const patch: { name?: string; description?: string | null; is_public?: boolean } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.isPublic !== undefined) patch.is_public = data.isPublic;


    const { data: list, error } = await context.supabase
      .from("lists")
      .update(patch)
      .eq("id", data.listId)
      .eq("creator_id", context.userId)
      .select(LIST_COLUMNS)
      .single();
    if (error) throw error;
    const mirror = await import("./neon/mirror.server");
    await mirror.mirrorRow(context.supabase, "lists", list as unknown as Record<string, unknown>, { userId: context.userId });
    return list as unknown as UserList;
  });

export const deleteList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => listIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("lists")
      .delete()
      .eq("id", data.listId)
      .eq("creator_id", context.userId);
    if (error) throw error;
    const mirror = await import("./neon/mirror.server");
    await mirror.mirrorRowDelete("lists", data.listId);
    return { success: true };
  });

export const addMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => listMemberSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("list_members")
      .upsert({ list_id: data.listId, user_id: data.userId }, { onConflict: "list_id,user_id" });
    if (error) throw error;
    const mirror = await import("./neon/mirror.server");
    await mirror.resyncScope("list_members", "list_id", data.listId);
    return { isMember: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => listMemberSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("list_members")
      .delete()
      .eq("list_id", data.listId)
      .eq("user_id", data.userId);
    if (error) throw error;
    const mirror = await import("./neon/mirror.server");
    await mirror.resyncScope("list_members", "list_id", data.listId);
    return { isMember: false };
  });

/** Lists created by a user. Only the owner sees their private lists (RLS). */
export const getUserLists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => userIdSchema.partial().parse(input ?? {}))
  .handler(async ({ data, context }): Promise<UserList[]> => {
    const creatorId = data.userId ?? context.userId;
    const { listUserLists } = await import("./neon/features.server");
    return (await listUserLists(context.userId, creatorId)) as unknown as UserList[];
  });

export const getListById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => listIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const neon = await import("./neon/features.server");
    const list = await neon.getVisibleList(context.userId, data.listId);
    if (!list) return null;
    const [members, creator] = await Promise.all([
      neon.listMembersOf(data.listId),
      neon.getParticipant(list.creator_id),
    ]);
    return {
      list: { ...(list as unknown as UserList), creator: (creator ?? null) as unknown as ListMember | null },
      members: members as unknown as ListMember[],
      isOwner: list.creator_id === context.userId,
    };
  });

/** Posts from the members of a list. Visibility is enforced by RLS on the list. */
export const getListFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => listFeedSchema.parse(input))
  .handler(async ({ data, context }): Promise<Post[]> => {
    const neon = await import("./neon/features.server");
    const list = await neon.getVisibleList(context.userId, data.listId);
    if (!list) throw new Error("List not found");
    return (await neon.listFeedForList(data.listId, data.limit, data.cursor)) as unknown as Post[];
  });

/** Public lists a given user belongs to (for profile display). */
export const getListsContainingUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => userIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<UserList[]> => {
    const { listsContaining } = await import("./neon/features.server");
    return (await listsContaining(context.userId, data.userId)) as unknown as UserList[];
  });

/** The caller's own lists, each flagged with whether the given user is a member. */
export const getListMembershipsForUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => userIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { listMembershipsFor } = await import("./neon/features.server");
    return (await listMembershipsFor(context.userId, data.userId)) as unknown as (UserList & { isMember: boolean })[];
  });
