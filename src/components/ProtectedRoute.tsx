import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: Array<"ADMIN_MASTER" | "ADMIN_UNIDADE" | "RESPONSAVEL">;
}

const ProtectedRoute = ({ children, requiredRoles }: ProtectedRouteProps) => {
  const { user, roles, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (requiredRoles && !requiredRoles.some((r) => roles.includes(r))) {
    // Redirect to correct area instead of login
    const isAdmin = roles.includes("ADMIN_MASTER") || roles.includes("ADMIN_UNIDADE");
    const redirectTo = isAdmin ? "/admin" : "/app";
    console.warn("[auth] ProtectedRoute: role mismatch", { roles, requiredRoles, redirectTo });
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
