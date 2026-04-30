import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
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
  const mountedRef = useRef(false);
  const loadingRef = useRef(true);
  const syncRequestRef = useRef(0);

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

      const fetchedRoles = (rolesRes.data ?? []).map((r: { role: string }) => r.role as AppRole);
      console.info("[auth] fetchUserData completed", { userId, roles: fetchedRoles, hasProfile: !!profileRes.data });
      return {
        profile: (profileRes.data as Profile | null) ?? null,
        roles: fetchedRoles,
      };
    } catch (err) {
      console.error("[auth] fetchUserData error:", err);
      return {
        profile: null,
        roles: [] as AppRole[],
      };
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    loadingRef.current = true;

    const setLoadingSafe = (value: boolean) => {
      loadingRef.current = value;
      if (mountedRef.current) {
        setLoading(value);
      }
    };

    const syncSession = async (nextSession: Session | null) => {
      const requestId = ++syncRequestRef.current;

      if (!mountedRef.current) return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (!nextSession?.user) {
        clearUserData();
        setLoadingSafe(false);
        return;
      }

      setLoadingSafe(true);
      const userData = await fetchUserData(nextSession.user.id);

      if (!mountedRef.current || syncRequestRef.current !== requestId) return;

      setProfile(userData.profile);
      setRoles(userData.roles);
      setLoadingSafe(false);
    };

    const timeout = setTimeout(() => {
      if (mountedRef.current && loadingRef.current) {
        console.warn("[auth] Loading timeout reached, forcing loading=false");
        setLoadingSafe(false);
      }
    }, AUTH_TIMEOUT_MS);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        console.info("[auth] onAuthStateChange", { event: _event, hasSession: !!nextSession });

        if (_event === "INITIAL_SESSION") return;

        if (_event === "TOKEN_REFRESHED" || _event === "USER_UPDATED") {
          setSession(nextSession);
          setUser(nextSession?.user ?? null);
          return;
        }

        // Evita re-sync (e re-render com loading=true) quando o navegador
        // dispara SIGNED_IN apenas porque a aba voltou ao foco e a sessão
        // continua sendo a mesma. Isso preserva o estado de formulários
        // e a rota atual ao alternar abas.
        if (_event === "SIGNED_IN" && nextSession?.user?.id && nextSession.user.id === user?.id) {
          setSession(nextSession);
          return;
        }

        void syncSession(nextSession);
      }
    );

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error("[auth] getSession error:", error);
      void syncSession(data.session);
    });

    return () => {
      mountedRef.current = false;
      syncRequestRef.current += 1;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error("[auth] signInWithPassword error:", error);
      const normalizedMessage = `${error.message ?? ""}`.toLowerCase();

      if (normalizedMessage.includes("banned")) {
        return { error: "Seu acesso está inativo. Entre em contato com o administrador." };
      }

      if (normalizedMessage.includes("email not confirmed")) {
        return { error: "Confirme seu e-mail antes de entrar." };
      }

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
