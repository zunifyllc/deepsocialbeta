import { Link, useLocation } from "@tanstack/react-router";
import { Home, Search, Bell, Mail, User } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const navItems = [
  { icon: Home, label: "Home", href: "/home" },
  { icon: Search, label: "Explore", href: "/explore" },
  { icon: Bell, label: "Notifications", href: "/notifications" },
  { icon: Mail, label: "Messages", href: "/messages" },
  { icon: User, label: "Profile", href: "/profile" },
];

export function MobileNav() {
  const { user, profile } = useAuth();
  const location = useLocation();

  if (!user) return null;

  return (
    <nav className="fixed bottom-0 left-0 z-50 flex w-full items-center justify-around border-t border-border bg-background/80 px-2 py-2 backdrop-blur-md md:hidden">
      {navItems.map((item) => {
        const destination = item.label === "Profile"
          ? (profile ? `/${profile.username}` : "/settings/profile")
          : item.href;
        const isActive = location.pathname === destination || location.pathname.startsWith(destination + "/");
        const className = `flex flex-col items-center gap-1 rounded-full p-2 transition-colors hover:bg-accent ${
          isActive ? "font-bold text-foreground" : "text-muted-foreground"
        }`;
        const icon = <item.icon className="h-6 w-6" />;
        if (item.label === "Profile") {
          return profile
            ? <Link key={item.href} to="/$username" params={{ username: profile.username }} className={className} aria-label="Profile">{icon}</Link>
            : <Link key={item.href} to="/settings/profile" className={className} aria-label="Edit profile">{icon}</Link>;
        }
        return <Link key={item.href} to={item.href} className={className} aria-label={item.label}>{icon}</Link>;
      })}
    </nav>
  );
}
