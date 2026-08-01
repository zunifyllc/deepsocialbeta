import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createList } from "@/lib/lists.functions";

interface CreateListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export function CreateListDialog({ open, onOpenChange, onCreated }: CreateListDialogProps) {
  const create = useServerFn(createList);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim() || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await create({
        data: {
          name: name.trim(),
          description: description.trim() || undefined,
          isPublic,
        },
      });
      setName("");
      setDescription("");
      setIsPublic(false);
      onOpenChange(false);
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the list.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a new List</DialogTitle>
          <DialogDescription>Group people together and read a timeline of just their posts.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="list-name">Name</Label>
            <Input
              id="list-name"
              value={name}
              maxLength={60}
              placeholder="Design inspiration"
              onChange={(e) => setName(e.target.value)}
              data-testid="list-name-input"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="list-description">Description</Label>
            <Textarea
              id="list-description"
              value={description}
              maxLength={200}
              placeholder="What is this List about?"
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div>
              <p className="font-semibold">Make it public</p>
              <p className="text-sm text-muted-foreground">Anyone can view a public List.</p>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} aria-label="Make List public" />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            className="rounded-full font-bold"
            disabled={!name.trim() || isSaving}
            onClick={handleSubmit}
            data-testid="create-list-submit"
          >
            {isSaving ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
