import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";

import Login from "./pages/Login";
import AppLayout from "./components/layouts/AppLayout";
import AppHome from "./pages/app/AppHome";
import AppPayments from "./pages/app/AppPayments";
import AppPaymentDetail from "./pages/app/AppPaymentDetail";
import AppProfile from "./pages/app/AppProfile";
import AdminLayout from "./components/layouts/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminAdmins from "./pages/admin/AdminAdmins";
import AdminUnits from "./pages/admin/AdminUnits";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminClients from "./pages/admin/AdminClients";
import AdminContracts from "./pages/admin/AdminContracts";
import AdminCharges from "./pages/admin/AdminCharges";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />

            {/* App do Responsável */}
            <Route path="/app" element={
              <ProtectedRoute requiredRoles={["RESPONSAVEL", "ADMIN_MASTER", "ADMIN_UNIDADE"]}>
                <AppLayout />
              </ProtectedRoute>
            }>
              <Route index element={<AppHome />} />
              <Route path="pagamentos" element={<AppPayments />} />
              <Route path="pagamentos/:id" element={<AppPaymentDetail />} />
              <Route path="payment/:id" element={<AppPaymentDetail />} />
              <Route path="perfil" element={<AppProfile />} />
            </Route>

            {/* Painel Admin */}
            <Route path="/admin" element={
              <ProtectedRoute requiredRoles={["ADMIN_MASTER", "ADMIN_UNIDADE"]}>
                <AdminLayout />
              </ProtectedRoute>
            }>
              <Route index element={<AdminDashboard />} />
              <Route path="administradores" element={<AdminAdmins />} />
              <Route path="unidades" element={<AdminUnits />} />
              <Route path="usuarios" element={<AdminUsers />} />
              <Route path="clientes" element={<AdminClients />} />
              <Route path="contratos" element={<AdminContracts />} />
              <Route path="cobrancas" element={<AdminCharges />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
