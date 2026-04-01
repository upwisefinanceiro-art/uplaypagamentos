import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

const AUTH_TIMEOUT_MS = 5000;

type AppRole = "ADMIN_MASTER" | "ADMIN_UNIDADE" | "RESPONSAVEL" | "SUPER_ADMIN";

interface Profile {
  id: string;
  cpf: string;
  full_name: string;
  phone: string | null;
  unit_id: string | null;
  active: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);



export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const clearUserData = () => {
    setProfile(null);
    setRoles([]);
  };

  const fetchUserData = async (userId: string) => {
    try {
      console.info("[auth] fetchUserData started", { userId });
      const [profileRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);

      if (profileRes.error) console.error("[auth] profile lookup error:", profileRes.error);
      if (rolesRes.error) console.error("[auth] roles lookup error:", rolesRes.error);

      setProfile((profileRes.data as Profile | null) ?? null);
      const fetchedRoles = (rolesRes.data ?? []).map((r: { role: string }) => r.role as AppRole);
      setRoles(fetchedRoles);
      console.info("[auth] fetchUserData completed", { userId, roles: fetchedRoles, hasProfile: !!profileRes.data });
    } catch (err) {
      console.error("[auth] fetchUserData error:", err);
      clearUserData();
    }
  };

  useEffect(() => {
    let mounted = true;

    const timeout = setTimeout(() => {
      if (mounted && loading) {
        console.warn("[auth] Loading timeout reached, forcing loading=false");
        setLoading(false);
      }
    }, AUTH_TIMEOUT_MS);

    const handleSession = (nextSession: Session | null) => {
      if (!mounted) return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        clearUserData();
        setLoading(false);
        return;
      }

      fetchUserData(nextSession.user.id).finally(() => {
        if (mounted) setLoading(false);
      });
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        console.info("[auth] onAuthStateChange", { event: _event, hasSession: !!session });
        handleSession(session);
      }
    );

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error("[auth] getSession error:", error);
      if (mounted && loading) handleSession(data.session);
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error("[auth] signInWithPassword error:", error);
      return { error: "Usuário ou senha inválidos" };
    }

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    clearUserData();
  };

  const hasRole = (role: AppRole) => roles.includes(role);
  const isAdmin = hasRole("ADMIN_MASTER") || hasRole("ADMIN_UNIDADE");

  return (
    <AuthContext.Provider value={{ user, session, profile, roles, loading, signIn, signOut, hasRole, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
