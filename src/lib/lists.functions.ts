import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { POST_WITH_AUTHOR } from "./feed-helpers";
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
    return list as unknown as UserList;
  });

export const updateList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => updateListSchema.parse(input))
  .handler(async ({ data, context }): Promise<UserList> => {
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch["name"] = data.name;
    if (data.description !== undefined) patch["description"] = data.description;
    if (data.isPublic !== undefined) patch["is_public"] = data.isPublic;

    const { data: list, error } = await context.supabase
      .from("lists")
      .update(patch)
      .eq("id", data.listId)
      .eq("creator_id", context.userId)
      .select(LIST_COLUMNS)
      .single();
    if (error) throw error;
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
    return { isMember: false };
  });

/** Lists created by a user. Only the owner sees their private lists (RLS). */
export const getUserLists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => userIdSchema.partial().parse(input ?? {}))
  .handler(async ({ data, context }): Promise<UserList[]> => {
    const creatorId = data.userId ?? context.userId;
    const { data: lists, error } = await context.supabase
      .from("lists")
      .select(`${LIST_COLUMNS}, list_members(count)`)
      .eq("creator_id", creatorId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return ((lists ?? []) as unknown as (UserList & { list_members?: { count: number }[] })[]).map(
      ({ list_members, ...list }) => ({ ...list, member_count: list_members?.[0]?.count ?? 0 }),
    );
  });

export const getListById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => listIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: list, error } = await context.supabase
      .from("lists")
      .select(LIST_COLUMNS)
      .eq("id", data.listId)
      .maybeSingle();
    if (error) throw error;
    if (!list) return null;

    const [{ data: members, error: membersError }, { data: creator }] = await Promise.all([
      context.supabase
        .from("list_members")
        .select("added_at, user:profiles!list_members_user_id_profiles_fkey(id, username, display_name, avatar_url, is_verified)")
        .eq("list_id", data.listId)
        .order("added_at", { ascending: false }),
      context.supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, is_verified")
        .eq("id", (list as unknown as UserList).creator_id)
        .maybeSingle(),
    ]);
    if (membersError) throw membersError;

    return {
      list: {
        ...(list as unknown as UserList),
        creator: (creator ?? null) as ListMember | null,
      },
      members: ((members ?? []) as unknown as { user: ListMember | null }[])
        .map((row) => row.user)
        .filter((user): user is ListMember => !!user),
      isOwner: (list as unknown as UserList).creator_id === context.userId,
    };
  });

/** Posts from the members of a list. Visibility is enforced by RLS on the list. */
export const getListFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => listFeedSchema.parse(input))
  .handler(async ({ data, context }): Promise<Post[]> => {
    const { data: list, error: listError } = await context.supabase
      .from("lists")
      .select("id")
      .eq("id", data.listId)
      .maybeSingle();
    if (listError) throw listError;
    if (!list) throw new Error("List not found");

    const { data: members, error: membersError } = await context.supabase
      .from("list_members")
      .select("user_id")
      .eq("list_id", data.listId);
    if (membersError) throw membersError;

    const memberIds = (members ?? []).map((m) => m.user_id);
    if (memberIds.length === 0) return [];

    let query = context.supabase
      .from("posts")
      .select(POST_WITH_AUTHOR)
      .in("author_id", memberIds)
      .is("parent_post_id", null)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.cursor) query = query.lt("created_at", data.cursor);

    const { data: posts, error } = await query;
    if (error) throw error;
    return (posts ?? []) as unknown as Post[];
  });

/** Public lists a given user belongs to (for profile display). */
export const getListsContainingUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => userIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<UserList[]> => {
    const { data: rows, error } = await context.supabase
      .from("list_members")
      .select(`list:lists!list_members_list_id_fkey(${LIST_COLUMNS})`)
      .eq("user_id", data.userId);
    if (error) throw error;

    return ((rows ?? []) as unknown as { list: UserList | null }[])
      .map((row) => row.list)
      .filter((list): list is UserList => !!list);
  });

/** The caller's own lists, each flagged with whether the given user is a member. */
export const getListMembershipsForUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => userIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const [{ data: lists, error }, { data: memberships, error: membershipError }] = await Promise.all([
      context.supabase
        .from("lists")
        .select(LIST_COLUMNS)
        .eq("creator_id", context.userId)
        .order("created_at", { ascending: false }),
      context.supabase.from("list_members").select("list_id").eq("user_id", data.userId),
    ]);
    if (error) throw error;
    if (membershipError) throw membershipError;

    const memberOf = new Set((memberships ?? []).map((m) => m.list_id));
    return ((lists ?? []) as unknown as UserList[]).map((list) => ({
      ...list,
      isMember: memberOf.has(list.id),
    }));
  });
