import { Link, useLocation } from "@tanstack/react-router";
import { Home, Search, Bell, Mail, Bookmark, List, User, Settings, Palette, Feather, Waves, ShieldCheck, ShieldOff, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { getMyAdminStatus } from "@/lib/admin.functions";

const navItems = [
  { icon: Home, label: "Home", href: "/home" },
  { icon: Search, label: "Explore", href: "/explore" },
  { icon: Bell, label: "Notifications", href: "/notifications" },
  { icon: Mail, label: "Messages", href: "/messages" },
  { icon: Bookmark, label: "Bookmarks", href: "/bookmarks" },
  { icon: Clock, label: "Scheduled", href: "/scheduled-posts" },
  { icon: List, label: "Lists", href: "/lists" },
  { icon: User, label: "Profile", href: "/profile" },
  { icon: Palette, label: "Display", href: "/settings/display" },
  { icon: ShieldOff, label: "Privacy", href: "/settings/privacy" },
  { icon: Settings, label: "Settings", href: "/settings/profile" },
];


export function Sidebar() {
  const { user, profile, signOut } = useAuth();
  const location = useLocation();
  const fetchAdminStatus = useServerFn(getMyAdminStatus);
  const { data: adminStatus } = useQuery({
    queryKey: ["admin-status"],
    queryFn: () => fetchAdminStatus({}),
    enabled: !!user,
  });

  if (!user) return null;

  const items = adminStatus?.isAdmin
    ? [...navItems, { icon: ShieldCheck, label: "Admin", href: "/admin" }]
    : navItems;

  return (
    <div className="hidden h-full min-h-0 flex-col justify-between gap-4 overflow-y-auto border-r border-border bg-background px-2 py-4 md:flex lg:px-3">
      <div className="flex flex-col gap-2">
        <Link to="/home" className="mb-2 flex items-center justify-center gap-3 rounded-xl p-3 transition-colors hover:bg-accent lg:justify-start">
          <Waves className="h-8 w-8 shrink-0 text-primary" />
          <span className="hidden text-xl font-bold tracking-tight lg:inline">DeepSocial</span>
        </Link>

        {items.map((item) => {
          const destination = item.label === "Profile"
            ? (profile ? `/${profile.username}` : "/settings/profile")
            : item.href;
          const isActive = location.pathname === destination || location.pathname.startsWith(destination + "/");
          const className = `flex min-h-11 items-center justify-center gap-3 rounded-xl px-3 py-2.5 text-base transition-colors hover:bg-accent lg:justify-start ${
            isActive ? "bg-accent font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground"
          }`;
          const label = (
            <>
              <item.icon className="h-6 w-6 shrink-0" aria-hidden="true" />
              <span className="hidden lg:inline">{item.label}</span>
            </>
          );
          if (item.label === "Profile") {
            return profile
              ? <Link key={item.href} to="/$username" params={{ username: profile.username }} className={className} aria-label={item.label} title={item.label}>{label}</Link>
              : <Link key={item.href} to="/settings/profile" className={className} aria-label={item.label} title={item.label}>{label}</Link>;
          }
          return <Link key={item.href} to={item.href} className={className} aria-label={item.label} title={item.label}>{label}</Link>;
        })}

        <Button asChild className="mt-3 hidden h-11 w-full rounded-full text-base font-bold lg:flex">
          <Link to="/home" hash="compose">Post</Link>
        </Button>
        <Button asChild size="icon" className="mx-auto mt-3 flex h-11 w-11 rounded-full lg:hidden">
          <Link to="/home" hash="compose" aria-label="Compose post">
            <Feather className="h-5 w-5" />
          </Link>
        </Button>
      </div>

      {profile && (
        <button
          onClick={() => signOut()}
          title="Sign out"
          aria-label="Sign out"
          className="flex shrink-0 items-center justify-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-accent lg:justify-start"
        >
          <div className="h-10 w-10 overflow-hidden rounded-full bg-muted">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.display_name ?? profile.username} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-bold text-muted-foreground">
                {(profile.display_name ?? profile.username).charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="hidden min-w-0 flex-col text-left lg:flex">
            <span className="truncate font-bold">{profile.display_name ?? profile.username}</span>
            <span className="truncate text-sm text-muted-foreground">@{profile.username}</span>
          </div>
        </button>
      )}
    </div>
  );
}
