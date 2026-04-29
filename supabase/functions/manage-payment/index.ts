import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonResponse = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type AppRole = "ADMIN_MASTER" | "ADMIN_UNIDADE" | "RESPONSAVEL";
type PaymentStatus = "PENDING" | "PAID" | "OVERDUE" | "CANCELLED";
type PaymentType = "MENSALIDADE" | "APOSTILA" | "AVULSA" | "MATRICULA";

type Action = "update" | "delete" | "cancel" | "create_manual" | "delete_contract";

interface ManagePaymentPayload {
  action: Action;
  payment_id?: string;
  responsible_id?: string;
  student_id?: string | null;
  contract_id?: string | null;
  payment_type?: PaymentType;
  description?: string;
  value?: number;
  due_date?: string;
  status?: PaymentStatus;
  payment_method?: string;
  stock_item_id?: string;
  stock_quantity?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Não autorizado" });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ error: "Configuração do servidor incompleta" });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authError } = await callerClient.auth.getUser();
    const caller = authData.user;

    if (authError || !caller) {
      return jsonResponse({ error: "Não autorizado" });
    }

    const [{ data: callerRoles }, { data: callerProfile }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("role").eq("user_id", caller.id),
      supabaseAdmin.from("profiles").select("unit_id").eq("id", caller.id).maybeSingle(),
    ]);

    const roles = (callerRoles || []).map((row: { role: AppRole }) => row.role);
    const isAdminMaster = roles.includes("ADMIN_MASTER");
    const isAdminUnidade = roles.includes("ADMIN_UNIDADE");

    if (!isAdminMaster && !isAdminUnidade) {
      return jsonResponse({ error: "Sem permissão" });
    }

    const payload = (await req.json()) as ManagePaymentPayload;
    const now = new Date().toISOString();

    const ensureUnitAccess = (unitId: string | null | undefined) => {
      if (isAdminMaster) return null;
      if (!unitId || callerProfile?.unit_id !== unitId) {
        return jsonResponse({ error: "Sem permissão para operar registros de outra unidade" });
      }
      return null;
    };

    const logAudit = async (action: string, targetId: string, details: Record<string, unknown>) => {
      await supabaseAdmin.from("audit_logs").insert({
        action,
        target_table: "payments",
        target_id: targetId,
        performed_by: caller.id,
        details,
      });
    };

    const syncAsaasRequest = async (unitId: string, path: string, method: string, body?: Record<string, unknown>) => {
      const { data: unit, error: unitError } = await supabaseAdmin
        .from("units")
        .select("asaas_api_key, asaas_base_url")
        .eq("id", unitId)
        .single();

      if (unitError || !unit?.asaas_api_key) {
        return { ok: false, error: "A unidade não possui integração financeira configurada.", status: 0 };
      }

      const url = `${unit.asaas_base_url || "https://api.asaas.com/v3"}${path}`;
      console.log(`[manage-payment] Asaas ${method} ${url}`);

      const response = await fetch(url, {
        method,
        headers: {
          access_token: unit.asaas_api_key,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const responseBody = await response.json().catch(() => null);
      console.log(`[manage-payment] Asaas response ${response.status}:`, JSON.stringify(responseBody));

      if (!response.ok) {
        const errDesc = responseBody?.errors?.[0]?.description || responseBody?.message || "Erro ao sincronizar cobrança externa";
        return {
          ok: false,
          error: errDesc,
          status: response.status,
          code: responseBody?.errors?.[0]?.code || null,
          notFound: response.status === 404 || /n[aã]o encontrad|not found|removid/i.test(errDesc),
          paid: /pag[ao]|received|confirmed|recebid/i.test(errDesc),
        };
      }

      return { ok: true, data: responseBody, status: response.status };
    };

    const loadPayment = async (paymentId?: string) => {
      if (!paymentId) return { error: "payment_id é obrigatório", payment: null };

      const { data: payment, error } = await supabaseAdmin
        .from("payments")
        .select("id, responsible_id, contract_id, student_id, unit_id, status, value, final_value, due_date, description, payment_type, installment_number, asaas_payment_id, invoice_url, boleto_url, checkout_url, pix_copy_paste, pix_qr_code")
        .eq("id", paymentId)
        .single();

      if (error || !payment) {
        return { error: "Parcela não encontrada", payment: null };
      }

      return { error: null, payment };
    };

    // ── DELETE CONTRACT ──
    if (payload.action === "delete_contract") {
      const contractId = payload.contract_id;
      if (!contractId) {
        return jsonResponse({ error: "contract_id é obrigatório" });
      }

      const { data: contract, error: contractError } = await supabaseAdmin
        .from("contracts")
        .select("id, responsible_id, unit_id, description, status")
        .eq("id", contractId)
        .single();

      if (contractError || !contract) {
        return jsonResponse({ error: "Contrato não encontrado" });
      }

      const unitAccessError = ensureUnitAccess(contract.unit_id);
      if (unitAccessError) return unitAccessError;

      // Check for paid payments
      const { data: paidPayments, count: paidCount } = await supabaseAdmin
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("contract_id", contractId)
        .in("status", ["PAID", "RECEIVED", "CONFIRMED"]);

      if ((paidCount ?? 0) > 0) {
        return jsonResponse({
          error: `Este contrato possui ${paidCount} parcela(s) paga(s) e não pode ser excluído. Desative-o ou ajuste manualmente.`,
          has_paid: true,
          paid_count: paidCount,
        });
      }

      // Delete all unpaid payments for this contract
      const { data: deletedPayments } = await supabaseAdmin
        .from("payments")
        .delete()
        .eq("contract_id", contractId)
        .select("id");

      // Delete the contract
      const { error: deleteError } = await supabaseAdmin
        .from("contracts")
        .delete()
        .eq("id", contractId);

      if (deleteError) {
        return jsonResponse({ error: deleteError.message });
      }

      await logAudit("DELETE_CONTRACT", contractId, {
        description: contract.description,
        deleted_payments: deletedPayments?.length || 0,
      });

      return jsonResponse({
        success: true,
        message: `Contrato excluído com ${deletedPayments?.length || 0} parcela(s) removida(s)`,
        deleted_payments: deletedPayments?.length || 0,
      });
    }

    if (payload.action === "create_manual") {
      if (!payload.responsible_id || !payload.value || !payload.due_date || !payload.payment_type) {
        return jsonResponse({ error: "responsible_id, value, due_date e payment_type são obrigatórios" });
      }
      const resolvedDescription = payload.description?.trim() || (payload.payment_type === "MENSALIDADE" ? "Mensalidade" : payload.payment_type === "APOSTILA" ? "Apostila" : payload.payment_type === "MATRICULA" ? "Matrícula" : "Cobrança Avulsa");

      let resolvedUnitId: string | null = null;
      let resolvedStudentId = payload.student_id || null;
      let resolvedContractId = payload.contract_id || null;

      if (resolvedContractId) {
        const { data: contract, error: contractError } = await supabaseAdmin
          .from("contracts")
          .select("id, responsible_id, student_id, unit_id, description")
          .eq("id", resolvedContractId)
          .single();

        if (contractError || !contract) {
          return jsonResponse({ error: "Contrato vinculado não encontrado" });
        }

        if (contract.responsible_id !== payload.responsible_id) {
          return jsonResponse({ error: "O contrato informado não pertence ao responsável selecionado" });
        }

        resolvedUnitId = contract.unit_id;
        resolvedStudentId = contract.student_id;
      } else {
        const { data: responsible, error: responsibleError } = await supabaseAdmin
          .from("profiles")
          .select("id, unit_id, active")
          .eq("id", payload.responsible_id)
          .single();

        if (responsibleError || !responsible) {
          return jsonResponse({ error: "Responsável não encontrado" });
        }

        if (!responsible.active) {
          return jsonResponse({ error: "Este responsável está inativo e não pode receber novas parcelas" });
        }

        resolvedUnitId = responsible.unit_id;
      }

      const unitAccessError = ensureUnitAccess(resolvedUnitId);
      if (unitAccessError) return unitAccessError;

      if (!resolvedUnitId) {
        return jsonResponse({ error: "Não foi possível determinar a unidade desta parcela" });
      }

      const { data: lastInstallment } = await supabaseAdmin
        .from("payments")
        .select("installment_number")
        .eq("contract_id", resolvedContractId)
        .order("installment_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      const installmentNumber = resolvedContractId ? (lastInstallment?.installment_number || 0) + 1 : 1;
      const nextValue = Number(payload.value);

      const { data: insertedPayment, error: insertError } = await supabaseAdmin
        .from("payments")
        .insert({
          responsible_id: payload.responsible_id,
          student_id: resolvedStudentId,
          contract_id: resolvedContractId,
          unit_id: resolvedUnitId,
          installment_number: installmentNumber,
          due_date: payload.due_date,
          value: nextValue,
          original_value: nextValue,
          final_value: nextValue,
          punctuality_discount: 0,
          status: "PENDING",
          payment_type: payload.payment_type,
          payment_method: payload.payment_method || null,
          description: resolvedDescription,
          updated_at: now,
          stock_item_id: payload.stock_item_id || null,
          stock_quantity: payload.stock_quantity || 1,
        })
        .select("id")
        .single();

      if (insertError || !insertedPayment) {
        return jsonResponse({ error: insertError?.message || "Erro ao salvar parcela manual" });
      }

      await logAudit("CREATE_PAYMENT", insertedPayment.id, {
        responsible_id: payload.responsible_id,
        contract_id: resolvedContractId,
        student_id: resolvedStudentId,
        value: nextValue,
        due_date: payload.due_date,
        payment_type: payload.payment_type,
      });

      return jsonResponse({ success: true, payment_id: insertedPayment.id });
    }

    const { payment, error: paymentError } = await loadPayment(payload.payment_id);
    if (paymentError || !payment) {
      return jsonResponse({ error: paymentError || "Parcela não encontrada" });
    }

    const unitAccessError = ensureUnitAccess(payment.unit_id);
    if (unitAccessError) return unitAccessError;

    if (payload.action === "delete") {
      if (payment.status === "PAID") {
        return jsonResponse({ error: "Esta parcela já foi paga e não pode ser excluída. Use cancelamento/ajuste manual." });
      }

      if (payment.asaas_payment_id) {
        const deletedExternally = await syncAsaasRequest(payment.unit_id, `/payments/${payment.asaas_payment_id}`, "DELETE");
        if (!deletedExternally.ok && !deletedExternally.notFound) {
          return jsonResponse({ error: deletedExternally.error || "Erro ao excluir cobrança externa" });
        }
      }

      const { error: deleteError } = await supabaseAdmin.from("payments").delete().eq("id", payment.id);
      if (deleteError) {
        return jsonResponse({ error: deleteError.message });
      }

      await logAudit("DELETE_PAYMENT", payment.id, {
        before: payment,
      });

      return jsonResponse({ success: true });
    }

    if (payload.action === "cancel") {
      if (payment.status === "PAID") {
        return jsonResponse({ error: "Esta parcela já foi paga e não pode ser cancelada automaticamente. Faça o ajuste manual do financeiro." });
      }

      if (payment.asaas_payment_id) {
        const cancelledExternally = await syncAsaasRequest(payment.unit_id, `/payments/${payment.asaas_payment_id}`, "DELETE");
        if (!cancelledExternally.ok && !cancelledExternally.notFound) {
          return jsonResponse({ error: cancelledExternally.error || "Erro ao cancelar cobrança externa" });
        }
      }

      const updatePayload = {
        status: "CANCELLED",
        invoice_url: null,
        boleto_url: null,
        checkout_url: null,
        pix_copy_paste: null,
        pix_qr_code: null,
        updated_at: now,
      };

      const { error: updateError } = await supabaseAdmin.from("payments").update(updatePayload).eq("id", payment.id);
      if (updateError) {
        return jsonResponse({ error: updateError.message });
      }

      await logAudit("CANCEL_PAYMENT", payment.id, {
        before_status: payment.status,
        after_status: "CANCELLED",
      });

      return jsonResponse({ success: true });
    }

    if (payload.action === "update") {
      if (!payload.value || !payload.due_date || !payload.description?.trim() || !payload.status) {
        return jsonResponse({ error: "value, due_date, description e status são obrigatórios" });
      }

      if (payment.status === "PAID") {
        return jsonResponse({ error: "Parcelas pagas não podem ser editadas automaticamente. Faça o ajuste manual do financeiro." });
      }

      let asaasIdToKeep: string | null = payment.asaas_payment_id;
      let asaasWarning: string | null = null;
      const isManualReceipt = payload.status === "PAID" && !!payment.asaas_payment_id;

      // Baixa manual ("Receber em Dinheiro") quando marcar como PAID com cobrança Asaas vinculada
      if (isManualReceipt) {
        const receivedValue = Number(payload.value);
        const paymentDate = new Date().toISOString().slice(0, 10);
        const receiveResult = await syncAsaasRequest(
          payment.unit_id,
          `/payments/${payment.asaas_payment_id}/receiveInCash`,
          "POST",
          {
            paymentDate,
            value: receivedValue,
            notifyCustomer: false,
          },
        );

        if (!receiveResult.ok) {
          if (receiveResult.paid) {
            // Já consta paga no Asaas — sincroniza e segue
            console.log(`[manage-payment] Cobrança ${payment.asaas_payment_id} já paga no Asaas. Sincronizando.`);
            await supabaseAdmin.functions.invoke("sync-asaas-payment", { body: { payment_id: payment.id } }).catch(() => null);
          } else if (receiveResult.notFound) {
            asaasIdToKeep = null;
            asaasWarning = "A cobrança original não foi encontrada no Asaas. A baixa foi registrada apenas localmente.";
          } else {
            return jsonResponse({
              error: "Não foi possível sincronizar a baixa com o Asaas. Verifique a conexão.",
              details: receiveResult.error,
            });
          }
        }
      } else if (payment.asaas_payment_id && payload.status !== "CANCELLED") {
        const syncedUpdate = await syncAsaasRequest(payment.unit_id, `/payments/${payment.asaas_payment_id}`, "PUT", {
          value: Number(payload.value),
          dueDate: payload.due_date,
          description: payload.description.trim(),
        });

        if (!syncedUpdate.ok) {
          // Se a cobrança foi removida no Asaas, desvincular localmente e seguir
          if (syncedUpdate.notFound) {
            console.log(`[manage-payment] Cobrança ${payment.asaas_payment_id} não existe mais no Asaas. Desvinculando.`);
            asaasIdToKeep = null;
            asaasWarning = "A cobrança original foi removida do Asaas. Os dados foram atualizados localmente e o vínculo externo foi removido. Gere uma nova cobrança se necessário.";
          } else if (syncedUpdate.paid) {
            // Já está paga no Asaas — disparar sync para refletir
            console.log(`[manage-payment] Cobrança ${payment.asaas_payment_id} já está paga no Asaas. Disparando sync.`);
            await supabaseAdmin.functions.invoke("sync-asaas-payment", { body: { payment_id: payment.id } }).catch(() => null);
            return jsonResponse({ error: "Esta cobrança já consta como paga no Asaas. O sistema foi sincronizado — recarregue a tela." });
          } else {
            return jsonResponse({ error: syncedUpdate.error || "Erro ao atualizar cobrança externa" });
          }
        }
      }

      if (payload.status === "CANCELLED") {
        if (payment.asaas_payment_id) {
          const cancelledExternally = await syncAsaasRequest(payment.unit_id, `/payments/${payment.asaas_payment_id}`, "DELETE");
          if (!cancelledExternally.ok && !cancelledExternally.notFound) {
            return jsonResponse({ error: cancelledExternally.error || "Erro ao cancelar cobrança externa" });
          }
          asaasIdToKeep = null;
        }
      }

      const updatePayload: Record<string, unknown> = {
        value: Number(payload.value),
        final_value: Number(payload.value),
        due_date: payload.due_date,
        description: payload.description.trim(),
        status: payload.status,
        paid_at: payload.status === "PAID" ? now : null,
        invoice_url: payload.status === "CANCELLED" || asaasIdToKeep === null ? null : payment.invoice_url,
        boleto_url: payload.status === "CANCELLED" || asaasIdToKeep === null ? null : payment.boleto_url,
        checkout_url: payload.status === "CANCELLED" || asaasIdToKeep === null ? null : payment.checkout_url,
        pix_copy_paste: payload.status === "CANCELLED" || asaasIdToKeep === null ? null : payment.pix_copy_paste,
        pix_qr_code: payload.status === "CANCELLED" || asaasIdToKeep === null ? null : payment.pix_qr_code,
        asaas_payment_id: asaasIdToKeep,
        updated_at: now,
      };

      const { error: updateError } = await supabaseAdmin.from("payments").update(updatePayload).eq("id", payment.id);
      if (updateError) {
        return jsonResponse({ error: updateError.message });
      }

      await logAudit("UPDATE_PAYMENT", payment.id, {
        before: payment,
        after: updatePayload,
        asaas_warning: asaasWarning,
      });

      return jsonResponse({ success: true, warning: asaasWarning });
    }

    return jsonResponse({ error: "Ação inválida" });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Erro interno ao gerenciar parcela",
    });
  }
});
