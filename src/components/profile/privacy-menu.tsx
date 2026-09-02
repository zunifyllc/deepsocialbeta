import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MoreHorizontal, Ban, VolumeX, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { getRelationshipState, toggleMute, toggleBlock } from "@/lib/privacy.functions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function useRelationshipState(userId: string) {
  const { user } = useAuth();
  const fetchState = useServerFn(getRelationshipState);
  return useQuery({
    queryKey: ["relationship-state", userId],
    queryFn: () => fetchState({ data: { targetUserId: userId } }),
    enabled: !!user && user.id !== userId,
  });
}

interface PrivacyMenuItemsProps {
  userId: string;
  username: string;
  onBlockRequest: () => void;
}

/** Mute / block entries for an existing dropdown menu. */
export function PrivacyMenuItems({ userId, username, onBlockRequest }: PrivacyMenuItemsProps) {
  const { data: state } = useRelationshipState(userId);
  const mute = useServerFn(toggleMute);
  const queryClient = useQueryClient();

  const handleMute = async () => {
    try {
      const res = await mute({ data: { targetUserId: userId } });
      toast.success(res.isMuted ? `Muted @${username}` : `Unmuted @${username}`);
      queryClient.invalidateQueries({ queryKey: ["relationship-state", userId] });
      queryClient.invalidateQueries();
    } catch {
      toast.error("Could not update mute");
    }
  };

  return (
    <>
      <DropdownMenuItem onClick={handleMute}>
        {state?.isMuted ? (
          <>
            <Volume2 className="mr-2 h-4 w-4" /> Unmute @{username}
          </>
        ) : (
          <>
            <VolumeX className="mr-2 h-4 w-4" /> Mute @{username}
          </>
        )}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onBlockRequest} className="text-destructive">
        <Ban className="mr-2 h-4 w-4" />
        {state?.isBlocked ? `Unblock @${username}` : `Block @${username}`}
      </DropdownMenuItem>
    </>
  );
}

interface BlockDialogProps {
  userId: string;
  username: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BlockConfirmDialog({ userId, username, open, onOpenChange }: BlockDialogProps) {
  const { data: state } = useRelationshipState(userId);
  const block = useServerFn(toggleBlock);
  const queryClient = useQueryClient();
  const isBlocked = !!state?.isBlocked;

  const handleBlock = async () => {
    try {
      const res = await block({ data: { targetUserId: userId } });
      toast.success(res.isBlocked ? `Blocked @${username}` : `Unblocked @${username}`);
      onOpenChange(false);
      queryClient.invalidateQueries();
    } catch {
      toast.error("Could not update block");
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isBlocked ? `Unblock @${username}?` : `Block @${username}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isBlocked
              ? `You will both be able to see each other's posts and profiles again. Past follows and likes are not restored.`
              : `Blocking will prevent @${username} from following you, viewing your profile, or interacting with your posts. Existing follows and likes between you will be removed.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleBlock}>
            {isBlocked ? "Unblock" : "Block"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Standalone overflow menu used on profiles. */
export function PrivacyMenu({ userId, username }: { userId: string; username: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="More options"
          className="rounded-full border border-border p-2.5 text-foreground transition-colors hover:bg-accent"
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <PrivacyMenuItems
            userId={userId}
            username={username}
            onBlockRequest={() => setConfirmOpen(true)}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <BlockConfirmDialog
        userId={userId}
        username={username}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
      />
    </>
  );
}
