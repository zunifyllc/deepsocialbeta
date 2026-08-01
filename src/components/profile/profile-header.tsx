import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Calendar, MapPin, Link as LinkIcon } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { FollowButton } from "./follow-button";
import { Button } from "@/components/ui/button";

interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  location: string | null;
  website: string | null;
  created_at: string;
  is_verified?: boolean;
}

interface ProfileHeaderProps {
  profile: Profile;
  followingCount: number;
  followersCount: number;
  activeTab: "posts" | "replies" | "media" | "likes";
  onTabChange: (tab: "posts" | "replies" | "media" | "likes") => void;
}

export function ProfileHeader({
  profile,
  followingCount,
  followersCount,
  activeTab,
  onTabChange,
}: ProfileHeaderProps) {
  const { user } = useAuth();
  const isOwner = user?.id === profile.id;
  const [imageError, setImageError] = useState({ banner: false, avatar: false });

  return (
    <div className="border-b border-border">
      <div className="sticky top-0 z-10 flex items-center gap-4 bg-background/80 px-4 py-2 backdrop-blur-md">
        <Link to="/home" className="rounded-full p-2 transition-colors hover:bg-accent">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold leading-tight">{profile.display_name ?? profile.username}</h1>
          <p className="text-sm text-muted-foreground">0 posts</p>
        </div>
      </div>

      <div className="relative h-32 bg-muted sm:h-48">
        {profile.banner_url && !imageError.banner && (
          <img
            src={profile.banner_url}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImageError((prev) => ({ ...prev, banner: true }))}
          />
        )}
      </div>

      <div className="relative px-4 pb-4">
        <div className="absolute -top-16 left-4 h-32 w-32 overflow-hidden rounded-full border-4 border-background bg-muted">
          {profile.avatar_url && !imageError.avatar ? (
            <img
              src={profile.avatar_url}
              alt={profile.display_name ?? profile.username}
              className="h-full w-full object-cover"
              onError={() => setImageError((prev) => ({ ...prev, avatar: true }))}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-muted-foreground">
              {(profile.display_name ?? profile.username).charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <div className="mt-20 flex justify-end gap-2">
          {isOwner ? (
            <Link to="/settings/profile">
              <Button variant="outline" className="rounded-full border-border bg-transparent font-bold text-foreground hover:bg-accent">
                Edit profile
              </Button>
            </Link>
          ) : (
            <FollowButton userId={profile.id} />
          )}
        </div>

        <div className="mt-4">
          <h2 className="text-xl font-bold leading-tight">
            {profile.display_name ?? profile.username}
            {profile.is_verified && (
              <svg className="ml-1 inline h-5 w-5 text-primary" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            )}
          </h2>
          <p className="text-muted-foreground">@{profile.username}</p>
        </div>

        {profile.bio && <p className="mt-3 whitespace-pre-wrap text-[15px]">{profile.bio}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {profile.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {profile.location}
            </span>
          )}
          {profile.website && (
            <a
              href={profile.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              <LinkIcon className="h-4 w-4" />
              {profile.website.replace(/^https?:\/\//, "")}
            </a>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            Joined {format(new Date(profile.created_at), "MMMM yyyy")}
          </span>
        </div>

        <div className="mt-3 flex gap-4 text-sm">
          <Link to="/$username/following" params={{ username: profile.username }} className="hover:underline">
            <span className="font-bold text-foreground">{followingCount}</span>{" "}
            <span className="text-muted-foreground">Following</span>
          </Link>
          <Link to="/$username/followers" params={{ username: profile.username }} className="hover:underline">
            <span className="font-bold text-foreground">{followersCount}</span>{" "}
            <span className="text-muted-foreground">Followers</span>
          </Link>
        </div>
      </div>

      <div className="mt-4 flex border-b border-border">
        {(["posts", "replies", "media", "likes"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`relative flex-1 py-4 text-center text-sm font-medium capitalize transition-colors hover:bg-accent/50 ${
              activeTab === tab ? "font-bold text-foreground" : "text-muted-foreground"
            }`}
          >
            {tab}
            {activeTab === tab && <div className="absolute bottom-0 left-1/2 h-1 w-16 -translate-x-1/2 rounded-full bg-primary" />}
          </button>
        ))}
      </div>
    </div>
  );
}
