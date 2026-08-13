import { Link, useLocation } from "@tanstack/react-router";
import { Home, Search, Bell, Mail, Bookmark, List, User, Settings, Palette, Feather, Waves, ShieldCheck } from "lucide-react";
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
  { icon: List, label: "Lists", href: "/lists" },
  { icon: User, label: "Profile", href: "/profile" },
  { icon: Palette, label: "Display", href: "/settings/display" },
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
    <div className="hidden h-full flex-col justify-between border-r border-border bg-background px-2 py-4 md:flex lg:px-4">
      <div className="flex flex-col gap-2">
        <Link to="/home" className="mb-4 flex items-center gap-3 rounded-full p-3 transition-colors hover:bg-accent lg:justify-start">
          <Waves className="h-8 w-8 shrink-0 text-primary" />
          <span className="hidden text-xl font-bold tracking-tight lg:inline">DeepSocial</span>
        </Link>

        {items.map((item) => {
          const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              to={item.href}
              className={`flex items-center gap-4 rounded-full p-3 text-xl transition-colors hover:bg-accent ${
                isActive ? "font-bold" : "font-medium"
              }`}
            >
              <item.icon className="h-7 w-7" />
              <span className="hidden lg:inline">{item.label}</span>
            </Link>
          );
        })}

        <Button className="mt-4 hidden h-12 w-full rounded-full text-lg font-bold lg:flex">Post</Button>
        <Button size="icon" className="mt-4 flex h-12 w-12 rounded-full lg:hidden">
          <Feather className="h-5 w-5" />
        </Button>
      </div>

      {profile && (
        <button
          onClick={() => signOut()}
          className="flex items-center gap-3 rounded-full p-3 transition-colors hover:bg-accent"
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
