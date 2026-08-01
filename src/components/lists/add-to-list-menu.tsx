import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ListPlus, MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateListDialog } from "./create-list-dialog";
import { addMember, getListMembershipsForUser, removeMember } from "@/lib/lists.functions";

interface AddToListMenuProps {
  userId: string;
  /** Renders as a compact icon-only trigger when true. */
  compact?: boolean;
}

export function AddToListMenu({ userId, compact = false }: AddToListMenuProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const add = useServerFn(addMember);
  const remove = useServerFn(removeMember);

  const { data: lists, isLoading } = useQuery({
    queryKey: ["list-memberships", userId],
    queryFn: () => getListMembershipsForUser({ data: { userId } }),
    enabled: open,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["list-memberships", userId] });
    queryClient.invalidateQueries({ queryKey: ["lists"] });
  };

  const toggle = async (listId: string, isMember: boolean) => {
    if (isMember) await remove({ data: { listId, userId } });
    else await add({ data: { listId, userId } });
    refresh();
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            aria-label="Add or remove from Lists"
            title="Add or remove from Lists"
            data-testid="add-to-list-trigger"
            className="rounded-full border-border bg-transparent text-foreground hover:bg-accent"
          >
            {compact ? <ListPlus className="h-4 w-4" /> : <MoreHorizontal className="h-5 w-5" />}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Add or remove from Lists</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {isLoading && <DropdownMenuItem disabled>Loading…</DropdownMenuItem>}
          {!isLoading && (lists?.length ?? 0) === 0 && (
            <DropdownMenuItem disabled>You have no Lists yet</DropdownMenuItem>
          )}

          {lists?.map((list) => (
            <DropdownMenuItem
              key={list.id}
              onSelect={(e) => {
                e.preventDefault();
                void toggle(list.id, list.isMember);
              }}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate">{list.name}</span>
              {list.isMember && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create a new List
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateListDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={refresh} />
    </>
  );
}
