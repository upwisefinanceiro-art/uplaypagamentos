import { useEffect, useState } from "react";
import { Loader2, MessageCircle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { openWhatsApp } from "@/lib/whatsapp-utils";
import { buildClientAccessMessage, isValidEmail, needsAsaasSync } from "@/lib/client-access";

interface StudentEdit {
  id: string;
  full_name: string;
  dirty: boolean;
}

interface ContractEdit {
  id: string;
  contract_number: string | null;
  description: string;
  dirty: boolean;
}

interface UserEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    id: string;
    full_name: string;
    cpf: string;
    phone: string | null;
    unit_id: string | null;
    email?: string | null;
    address?: string | null;
    active?: boolean;
  } | null;
  units: { id: string; name: string }[];
  onSaved: () => void | Promise<void>;
  showUnitSelector?: boolean;
}

const UserEditDialog = ({ open, onOpenChange, user, units, onSaved, showUnitSelector = false }: UserEditDialogProps) => {
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [unitId, setUnitId] = useState("");
  const [saving, setSaving] = useState(false);
  const [studentsEdit, setStudentsEdit] = useState<StudentEdit[]>([]);
  const [contractsEdit, setContractsEdit] = useState<ContractEdit[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [syncingAsaas, setSyncingAsaas] = useState(false);
  const { toast } = useToast();

  const syncFromAsaas = async ({ silent = false, automatic = false }: { silent?: boolean; automatic?: boolean } = {}) => {
    if (!user) return;

    setSyncingAsaas(true);
    const { data, error } = await supabase.functions.invoke("sync-client-emails", {
      body: {
        profile_id: user.id,
        unit_id: user.unit_id,
        automatic,
        update_name: true,
        update_phone: true,
      },
    });
    setSyncingAsaas(false);

    if (error || data?.error) {
      if (!silent) {
        toast({
          title: "Erro ao sincronizar com Asaas",
          description: error?.message || data?.error,
          variant: "destructive",
        });
      }
      return;
    }

    const detail = Array.isArray(data?.details) ? data.details[0] : null;
    if (detail) {
      if (typeof detail.new_name === "string") setName(detail.new_name);
      if (typeof detail.new_email === "string") setEmail(detail.new_email);
      if (typeof detail.new_phone === "string") setPhone(detail.new_phone);
    }

    if (!silent) {
      toast({
        title: data?.updated > 0 ? "Dados sincronizados com Asaas" : "Nenhuma alteração necessária",
        description: data?.protected_conflicts > 0 ? "Um e-mail válido diferente foi preservado por segurança." : undefined,
      });
    }

    if (data?.updated > 0) {
      await Promise.resolve(onSaved());
    }
  };

  useEffect(() => {
    if (user) {
      setName(user.full_name || "");
      setCpf(user.cpf || "");
      setPhone(user.phone || "");
      setEmail(user.email || "");
      setAddress(user.address || "");
      setUnitId(user.unit_id || "");
      fetchRelatedData(user.id);
      if (needsAsaasSync(user.email, user.phone)) {
        void syncFromAsaas({ silent: true, automatic: true });
      }
      return;
    }

    setName("");
    setCpf("");
    setPhone("");
    setEmail("");
    setAddress("");
    setUnitId("");
    setStudentsEdit([]);
    setContractsEdit([]);
  }, [user]);

  const fetchRelatedData = async (userId: string) => {
    setLoadingRelated(true);
    const [studentsRes, contractsRes] = await Promise.all([
      supabase.from("students").select("id, full_name").eq("responsible_id", userId).order("full_name"),
      supabase.from("contracts").select("id, contract_number, description").eq("responsible_id", userId).order("created_at"),
    ]);

    if (studentsRes.data) {
      setStudentsEdit(studentsRes.data.map((s) => ({ id: s.id, full_name: s.full_name, dirty: false })));
    }
    if (contractsRes.data) {
      setContractsEdit(
        contractsRes.data.map((c) => ({
          id: c.id,
          contract_number: c.contract_number,
          description: c.description,
          dirty: false,
        }))
      );
    }
    setLoadingRelated(false);
  };

  const handleStudentNameChange = (index: number, value: string) => {
    setStudentsEdit((prev) =>
      prev.map((s, i) => (i === index ? { ...s, full_name: value, dirty: true } : s))
    );
  };

  const handleContractNumberChange = (index: number, value: string) => {
    setContractsEdit((prev) =>
      prev.map((c, i) => (i === index ? { ...c, contract_number: value, dirty: true } : c))
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !name.trim() || !cpf.trim()) {
      toast({ title: "Nome e CPF são obrigatórios", variant: "destructive" });
      return;
    }

    if (email.trim() && !isValidEmail(email.trim())) {
      toast({ title: "E-mail inválido", description: "Informe um e-mail válido para salvar.", variant: "destructive" });
      return;
    }

    setSaving(true);

    try {
      // Save profile
      const { data, error } = await supabase.functions.invoke("update-user", {
        body: {
          user_id: user.id,
          full_name: name,
          cpf,
          phone: phone || null,
          email: email || null,
          address: address || null,
          unit_id: showUnitSelector ? unitId || null : undefined,
        },
      });

      if (error || data?.error) {
        toast({
          title: "Erro ao salvar",
          description: error?.message || data?.error,
          variant: "destructive",
        });
        return;
      }

      // Save dirty students
      const dirtyStudents = studentsEdit.filter((s) => s.dirty);
      for (const student of dirtyStudents) {
        await supabase.from("students").update({ full_name: student.full_name }).eq("id", student.id);
      }

      // Save dirty contracts
      const dirtyContracts = contractsEdit.filter((c) => c.dirty);
      for (const contract of dirtyContracts) {
        await supabase.from("contracts").update({ contract_number: contract.contract_number || null }).eq("id", contract.id);
      }

      await Promise.resolve(onSaved());
      toast({ title: "Dados atualizados com sucesso!" });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Erro inesperado",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleNotifyApp = () => {
    if (!user?.active) {
      toast({ title: "Cliente sem login ativo", variant: "destructive" });
      return;
    }

    if (!phone.trim()) {
      toast({ title: "Cliente sem telefone cadastrado", variant: "destructive" });
      return;
    }

    openWhatsApp(phone, buildClientAccessMessage({ cpf, email, fullName: name }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Editar Cadastro</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSave}>
          <div className="space-y-2">
            <Label className="text-foreground">Nome *</Label>
            <Input className="bg-input border-border text-foreground" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-foreground">CPF *</Label>
              <Input className="bg-input border-border text-foreground" value={cpf} onChange={(e) => setCpf(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Telefone</Label>
              <Input className="bg-input border-border text-foreground" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">E-mail</Label>
            <Input type="email" className="bg-input border-border text-foreground" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
            <Label className="text-foreground">Ações rápidas</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" className="gap-2" onClick={() => void syncFromAsaas()} disabled={syncingAsaas}>
                {syncingAsaas ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                Sincronizar com Asaas
              </Button>
              <Button type="button" variant="outline" className="gap-2" onClick={handleNotifyApp} disabled={!user?.active || !phone.trim()}>
                <MessageCircle size={16} />
                Notificar App
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-foreground">Endereço</Label>
            <Input className="bg-input border-border text-foreground" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>

          {showUnitSelector && (
            <div className="space-y-2">
              <Label className="text-foreground">Unidade</Label>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger className="bg-input border-border text-foreground">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Students section */}
          {loadingRelated ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
              <Loader2 size={14} className="animate-spin" /> Carregando alunos e contratos...
            </div>
          ) : (
            <>
              {studentsEdit.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <Label className="text-foreground text-sm font-semibold">Aluno(s)</Label>
                    {studentsEdit.map((student, index) => (
                      <Input
                        key={student.id}
                        className="bg-input border-border text-foreground"
                        placeholder="Nome do aluno"
                        value={student.full_name}
                        onChange={(e) => handleStudentNameChange(index, e.target.value)}
                      />
                    ))}
                  </div>
                </>
              )}

              <Separator />
              <div className="space-y-3">
                <Label className="text-foreground text-sm font-semibold">Contrato(s) — Número</Label>
                {contractsEdit.length > 0 ? (
                  contractsEdit.map((contract, index) => (
                    <div key={contract.id} className="space-y-1">
                      <p className="text-xs text-muted-foreground truncate">{contract.description}</p>
                      <Input
                        className="bg-input border-border text-foreground"
                        placeholder="Nº do contrato"
                        value={contract.contract_number || ""}
                        onChange={(e) => handleContractNumberChange(index, e.target.value)}
                      />
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">Nenhum contrato vinculado. Cadastre um contrato na tela de Contratos.</p>
                )}
              </div>
            </>
          )}

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin mr-2" /> Salvando...
              </>
            ) : (
              "Salvar Alterações"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default UserEditDialog;
