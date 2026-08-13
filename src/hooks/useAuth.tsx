import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "owner" | "manager" | "cashier" | "staff";

type Profile = { id: string; user_id: string; full_name: string; email: string };

type AuthState = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  isOwner: boolean;
  loading: boolean;
  displayName: string;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadMeta = async (userId: string) => {
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("id,user_id,full_name,email").eq("user_id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId).order("role").limit(1).maybeSingle(),
      ]);
      if (!active) return;
      setProfile((p as Profile) ?? null);
      setRole(((r?.role as AppRole) ?? "staff") as AppRole);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => void loadMeta(s.user.id), 0);
      } else {
        setProfile(null);
        setRole(null);
      }
    });

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) await loadMeta(data.session.user.id);
      if (active) setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthState = {
    user: session?.user ?? null,
    session,
    profile,
    role,
    isOwner: role === "owner",
    loading,
    displayName: profile?.full_name || session?.user?.email || "Team member",
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
