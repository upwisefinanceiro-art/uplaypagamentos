import { useState, useCallback } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";

import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AppLayout from "./components/layouts/AppLayout";
import AppHome from "./pages/app/AppHome";
import AppPayments from "./pages/app/AppPayments";
import AppPaymentDetail from "./pages/app/AppPaymentDetail";
import AppProfile from "./pages/app/AppProfile";
import AppChangePassword from "./pages/app/AppChangePassword";
import AdminLayout from "./components/layouts/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminAdmins from "./pages/admin/AdminAdmins";
import AdminUnits from "./pages/admin/AdminUnits";
import AdminUsers from "./pages/admin/AdminUsers";

import AdminContracts from "./pages/admin/AdminContracts";
import AdminCharges from "./pages/admin/AdminCharges";
import AdminFinancial from "./pages/admin/AdminFinancial";
import AdminStock from "./pages/admin/AdminStock";
import AdminCourses from "./pages/admin/AdminCourses";
import AdminCompanies from "./pages/admin/AdminCompanies";
import AdminSaasBilling from "./pages/admin/AdminSaasBilling";
import AdminUplayBilling from "./pages/admin/AdminUplayBilling";
import AdminSaasPlans from "./pages/admin/AdminSaasPlans";
import AdminBackup from "./pages/admin/AdminBackup";
import AdminAsaasFees from "./pages/admin/AdminAsaasFees";
import AdminFinancialPro from "./pages/admin/AdminFinancialPro";
import SuperAdminLayout from "./components/layouts/SuperAdminLayout";
import SuperDashboard from "./pages/super/SuperDashboard";
import SuperCompanies from "./pages/super/SuperCompanies";
import SuperSettings from "./pages/super/SuperSettings";
import SuperBilling from "./pages/super/SuperBilling";
import { CompanyBrandingProvider } from "./contexts/CompanyBrandingContext";
import NotFound from "./pages/NotFound";
import Instalar from "./pages/Instalar";
import SplashScreen from "./components/SplashScreen";

const queryClient = new QueryClient();

const App = () => {
  const [showSplash, setShowSplash] = useState(true);
  const handleSplashFinish = useCallback(() => setShowSplash(false), []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        {showSplash && <SplashScreen onFinish={handleSplashFinish} />}
        <BrowserRouter>
          <AuthProvider>
            <CompanyBrandingProvider>
            <Routes>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<Login />} />
              <Route path="/instalar" element={<Instalar />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />

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
                <Route path="alterar-senha" element={<AppChangePassword />} />
              </Route>

              {/* Painel Admin */}
              <Route path="/admin" element={
                <ProtectedRoute requiredRoles={["ADMIN_MASTER", "ADMIN_UNIDADE"]}>
                  <AdminLayout />
                </ProtectedRoute>
              }>
                <Route index element={<AdminDashboard />} />
                <Route path="empresa" element={<AdminCompanies />} />
                <Route path="administradores" element={<AdminAdmins />} />
                <Route path="unidades" element={<AdminUnits />} />
                <Route path="usuarios" element={<AdminUsers />} />
                <Route path="clientes" element={<Navigate to="/admin/contratos" replace />} />
                <Route path="contratos" element={<AdminContracts />} />
                <Route path="cobrancas" element={<AdminCharges />} />
                <Route path="financeiro" element={<AdminFinancial />} />
                <Route path="financeiro-pro" element={<AdminFinancialPro />} />
                <Route path="taxas-asaas" element={<AdminAsaasFees />} />
                <Route path="estoque" element={<AdminStock />} />
                <Route path="cursos" element={<AdminCourses />} />
                <Route path="cobrancas-saas" element={<AdminSaasBilling />} />
                <Route path="boletos-uplay" element={<AdminUplayBilling />} />
                <Route path="planos-saas" element={<AdminSaasPlans />} />
                <Route path="backup" element={<AdminBackup />} />
                <Route path="alterar-senha" element={<AppChangePassword />} />
              </Route>

              {/* Painel Super Admin */}
              <Route path="/super" element={
                <ProtectedRoute requiredRoles={["SUPER_ADMIN"]}>
                  <SuperAdminLayout />
                </ProtectedRoute>
              }>
                <Route index element={<SuperDashboard />} />
                <Route path="empresas" element={<SuperCompanies />} />
                <Route path="cobrancas" element={<SuperBilling />} />
                <Route path="configuracoes" element={<SuperSettings />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
            </CompanyBrandingProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
