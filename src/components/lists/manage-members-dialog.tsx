import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, UserMinus, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { searchAll } from "@/lib/search.functions";
import { addMember, removeMember } from "@/lib/lists.functions";
import type { ListMember } from "@/lib/lists-helpers";

interface ManageMembersDialogProps {
  listId: string;
  members: ListMember[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

export function ManageMembersDialog({
  listId,
  members,
  open,
  onOpenChange,
  onChanged,
}: ManageMembersDialogProps) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 300);
  const add = useServerFn(addMember);
  const remove = useServerFn(removeMember);

  const { data: results } = useQuery({
    queryKey: ["list-member-search", debounced],
    queryFn: () => searchAll({ data: { query: debounced, userLimit: 8, postLimit: 1 } }),
    enabled: open && debounced.trim().length > 0,
  });

  const memberIds = new Set(members.map((m) => m.id));

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["list", listId] });
    queryClient.invalidateQueries({ queryKey: ["list-feed", listId] });
    onChanged?.();
  };

  const handleAdd = async (userId: string) => {
    await add({ data: { listId, userId } });
    refresh();
  };

  const handleRemove = async (userId: string) => {
    await remove({ data: { listId, userId } });
    refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage members</DialogTitle>
          <DialogDescription>Search for people to add to this List.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people"
            className="pl-9"
            data-testid="member-search-input"
          />
        </div>

        <div className="max-h-64 overflow-y-auto">
          {(results?.users?.length ?? 0) > 0 && (
            <div className="flex flex-col">
              {results?.users.map((user) => (
                <MemberRow
                  key={user.id}
                  user={user as unknown as ListMember}
                  isMember={memberIds.has(user.id)}
                  onAdd={() => handleAdd(user.id)}
                  onRemove={() => handleRemove(user.id)}
                />
              ))}
            </div>
          )}

          {!debounced.trim() && (
            <div className="flex flex-col">
              <p className="px-1 py-2 text-sm font-semibold text-muted-foreground">
                Members ({members.length})
              </p>
              {members.length === 0 && (
                <p className="px-1 py-2 text-sm text-muted-foreground">No members yet.</p>
              )}
              {members.map((user) => (
                <MemberRow key={user.id} user={user} isMember onAdd={() => {}} onRemove={() => handleRemove(user.id)} />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MemberRow({
  user,
  isMember,
  onAdd,
  onRemove,
}: {
  user: ListMember;
  isMember: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg px-1 py-2 hover:bg-accent/50">
      <div className="flex min-w-0 items-center gap-2">
        <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-muted">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-bold text-muted-foreground">
              {(user.display_name ?? user.username).charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-bold">{user.display_name ?? user.username}</span>
          <span className="truncate text-sm text-muted-foreground">@{user.username}</span>
        </div>
      </div>

      <Button
        size="sm"
        variant={isMember ? "outline" : "default"}
        className="flex-shrink-0 rounded-full font-bold"
        onClick={isMember ? onRemove : onAdd}
      >
        {isMember ? <UserMinus className="mr-1 h-4 w-4" /> : <UserPlus className="mr-1 h-4 w-4" />}
        {isMember ? "Remove" : "Add"}
      </Button>
    </div>
  );
}
