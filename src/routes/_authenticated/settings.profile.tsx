import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AppShell } from "@/components/layout/app-shell";
import { useAuth } from "@/hooks/use-auth";
import { uploadMediaFile } from "@/lib/media";
import { updateProfile, getCurrentProfile, type Profile } from "@/lib/profiles.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/_authenticated/settings/profile")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Edit profile / DeepSocial" },
      { name: "description", content: "Edit your DeepSocial profile." },
    ],
  }),
  loader: () => getCurrentProfile(),
  component: EditProfilePage,
});

function EditProfilePage() {
  const { user, profile: authProfile, signOut } = useAuth();
  const [profile, setProfile] = useState(authProfile);
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [location, setLocation] = useState(profile?.location ?? "");
  const [website, setWebsite] = useState(profile?.website ?? "");
  const [pronouns, setPronouns] = useState(profile?.pronouns ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? "");
  const [bannerUrl, setBannerUrl] = useState(profile?.banner_url ?? "");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const save = useServerFn(updateProfile);

  useEffect(() => {
    if (authProfile) {
      setProfile(authProfile);
      setDisplayName(authProfile.display_name ?? "");
      setBio(authProfile.bio ?? "");
      setLocation(authProfile.location ?? "");
      setWebsite(authProfile.website ?? "");
      setPronouns(authProfile.pronouns ?? "");
      setAvatarUrl(authProfile.avatar_url ?? "");
      setBannerUrl(authProfile.banner_url ?? "");
    }
  }, [authProfile]);

  if (!user || !profile) return null;

  const uploadProfileImage = async (
    e: React.ChangeEvent<HTMLInputElement>,
    purpose: "avatars" | "banners",
  ) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file || isUploading) return;
    setIsUploading(true);
    setMessage("");
    try {
      const url = await uploadMediaFile(file, user.id, purpose);
      if (purpose === "avatars") setAvatarUrl(url);
      else setBannerUrl(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Image upload failed");
    } finally {
      input.value = "";
      setIsUploading(false);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    void uploadProfileImage(e, "avatars");

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    void uploadProfileImage(e, "banners");

  const handleSave = async () => {
    setIsLoading(true);
    setMessage("");
    try {
      await save({
        data: {
          display_name: displayName || null,
          bio: bio || null,
          location: location || null,
          website: website || null,
          pronouns: pronouns || null,
          avatar_url: avatarUrl || null,
          banner_url: bannerUrl || null,
        },
      });
      setMessage("Profile saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to save profile.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppShell hideRightSidebar>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/80 px-4 py-2 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <button onClick={() => window.history.back()} className="rounded-full p-2 transition-colors hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold">Edit profile</h1>
        </div>
        <Button
          onClick={handleSave}
          disabled={isLoading || isUploading}
          className="rounded-full bg-foreground px-5 font-bold text-background hover:bg-foreground/90"
        >
          {isUploading ? "Uploading..." : isLoading ? "Saving..." : "Save"}
        </Button>
      </div>

      <div className="relative h-40 bg-muted">
        {bannerUrl && <img src={bannerUrl} alt="" className="h-full w-full object-cover" />}
        <button
          onClick={() => bannerInputRef.current?.click()}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white"
        >
          <Camera className="h-5 w-5" />
        </button>
        <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerChange} />
      </div>

      <div className="relative px-4 pb-4">
        <div className="absolute -top-16 left-4 h-32 w-32 overflow-hidden rounded-full border-4 border-background bg-muted">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-muted-foreground">
              {(profile.display_name ?? profile.username).charAt(0).toUpperCase()}
            </div>
          )}
          <button
            onClick={() => avatarInputRef.current?.click()}
            className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 transition-opacity hover:opacity-100"
          >
            <Camera className="h-6 w-6" />
          </button>
          <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>
      </div>

      <div className="mt-20 space-y-6 px-4">
        {message && <p className="text-sm text-muted-foreground">{message}</p>}

        <div className="space-y-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={50}
            className="rounded-md border-border bg-background"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={160}
            rows={3}
            className="rounded-md border-border bg-background resize-none"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="pronouns">Pronouns</Label>
          <Input
            id="pronouns"
            value={pronouns}
            onChange={(e) => setPronouns(e.target.value)}
            maxLength={20}
            placeholder="she/her"
            className="rounded-md border-border bg-background"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={30}
            className="rounded-md border-border bg-background"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://example.com"
            className="rounded-md border-border bg-background"
          />
        </div>

        <Button
          variant="outline"
          onClick={() => signOut()}
          className="w-full rounded-full border-border bg-transparent font-bold text-destructive hover:bg-destructive/10"
        >
          Sign out
        </Button>
      </div>
    </AppShell>
  );
}
