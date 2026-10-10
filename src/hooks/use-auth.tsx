import { getCurrentProfile } from "@/lib/profiles.functions";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import type { Profile } from "@/lib/profiles.functions";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  profile: Profile | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = (session?.user as AuthUser | undefined) ?? null;
  const userId = user?.id ?? null;

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      setProfile((await getCurrentProfile()) as unknown as Profile);
    } catch {
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userId) void loadProfile();
    else setProfile(null);
  }, [userId, loadProfile]);

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await authClient.signOut();
    setProfile(null);
    await router.navigate({ to: "/auth", replace: true });
  };

  const refreshProfile = async () => {
    if (userId) await loadProfile();
  };

  return (
    <AuthContext.Provider
      value={{ user, profile, isLoading: isPending || profileLoading, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
