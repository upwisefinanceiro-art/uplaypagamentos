import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const ESTADOS_BR = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA",
  "PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

interface StudentEdit { id: string; full_name: string; dirty: boolean; }
interface ContractEdit { id: string; contract_number: string | null; description: string; dirty: boolean; }

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
  const [birthDate, setBirthDate] = useState("");
  const [rg, setRg] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncingAsaas, setSyncingAsaas] = useState(false);
  const [studentsEdit, setStudentsEdit] = useState<StudentEdit[]>([]);
  const [contractsEdit, setContractsEdit] = useState<ContractEdit[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const { toast } = useToast();

  const loadProfileExtras = async (userId: string) => {
    const { data } = await supabase
      .from("profiles")
      .select("birth_date, rg, address_number, complement, neighborhood, city, state, zip_code")
      .eq("id", userId)
      .maybeSingle();
    if (data) {
      setBirthDate((data as any).birth_date || "");
      setRg((data as any).rg || "");
      setAddressNumber((data as any).address_number || "");
      setComplement((data as any).complement || "");
      setNeighborhood((data as any).neighborhood || "");
      setCity((data as any).city || "");
      setState((data as any).state || "");
      setZipCode((data as any).zip_code || "");
    }
    // Fallback: if no address fields on profile, try last contract snapshot
    if (!data || (!(data as any).city && !(data as any).zip_code)) {
      const { data: contract } = await supabase
        .from("contracts")
        .select("birth_date, rg, address_number, complement, neighborhood, city, state, zip_code")
        .eq("responsible_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (contract) {
        setBirthDate((prev) => prev || (contract as any).birth_date || "");
        setRg((prev) => prev || (contract as any).rg || "");
        setAddressNumber((prev) => prev || (contract as any).address_number || "");
        setComplement((prev) => prev || (contract as any).complement || "");
        setNeighborhood((prev) => prev || (contract as any).neighborhood || "");
        setCity((prev) => prev || (contract as any).city || "");
        setState((prev) => prev || (contract as any).state || "");
        setZipCode((prev) => prev || (contract as any).zip_code || "");
      }
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
      setBirthDate(""); setRg(""); setAddressNumber(""); setComplement("");
      setNeighborhood(""); setCity(""); setState(""); setZipCode("");
      fetchRelatedData(user.id);
      loadProfileExtras(user.id);
      return;
    }
    setName(""); setCpf(""); setPhone(""); setEmail(""); setAddress(""); setUnitId("");
    setBirthDate(""); setRg(""); setAddressNumber(""); setComplement("");
    setNeighborhood(""); setCity(""); setState(""); setZipCode("");
    setStudentsEdit([]); setContractsEdit([]);
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
      setContractsEdit(contractsRes.data.map((c) => ({
        id: c.id, contract_number: c.contract_number, description: c.description, dirty: false,
      })));
    }
    setLoadingRelated(false);
  };

  const handleStudentNameChange = (index: number, value: string) => {
    setStudentsEdit((prev) => prev.map((s, i) => (i === index ? { ...s, full_name: value, dirty: true } : s)));
  };
  const handleContractNumberChange = (index: number, value: string) => {
    setContractsEdit((prev) => prev.map((c, i) => (i === index ? { ...c, contract_number: value, dirty: true } : c)));
  };

  const handleSyncAsaas = async () => {
    if (!user) return;
    setSyncingAsaas(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-clients-asaas", { body: { profile_id: user.id } });
      if (error || data?.error) {
        toast({ title: "Erro ao sincronizar", description: error?.message || data?.error, variant: "destructive" });
        return;
      }
      if (data?.updated > 0) {
        const fields = data.details?.[0]?.fields?.join(", ") || "";
        toast({ title: "Dados atualizados do Asaas", description: fields ? `Campos: ${fields}` : "Cliente sincronizado." });
        const { data: fresh } = await supabase
          .from("profiles")
          .select("full_name, cpf, phone, email, address, unit_id")
          .eq("id", user.id).maybeSingle();
        if (fresh) {
          setName(fresh.full_name || ""); setCpf(fresh.cpf || ""); setPhone(fresh.phone || "");
          setEmail(fresh.email || ""); setAddress(fresh.address || "");
        }
        await loadProfileExtras(user.id);
        await Promise.resolve(onSaved());
      } else {
        toast({ title: "Nenhuma atualização necessária", description: "Dados já estão alinhados com o Asaas." });
      }
    } catch (err) {
      toast({ title: "Erro ao sincronizar", description: err instanceof Error ? err.message : "Erro inesperado", variant: "destructive" });
    } finally { setSyncingAsaas(false); }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name.trim() || !cpf.trim()) {
      toast({ title: "Nome e CPF são obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("update-user", {
        body: {
          user_id: user.id,
          full_name: name,
          cpf,
          phone: phone || null,
          email: email || null,
          address: address || null,
          unit_id: showUnitSelector ? unitId || null : undefined,
          birth_date: birthDate || null,
          rg: rg || null,
          address_number: addressNumber || null,
          complement: complement || null,
          neighborhood: neighborhood || null,
          city: city || null,
          state: state || null,
          zip_code: zipCode || null,
        },
      });
      if (error || data?.error) {
        const rawMsg = error?.message || data?.error || "";
        const friendly = /profiles_cpf_unique|duplicate key.*cpf/i.test(rawMsg)
          ? "Já existe outro cadastro com este CPF. Verifique se a pessoa não foi cadastrada em duplicidade — neste caso, você precisa mesclar os registros antes de alterar o CPF."
          : rawMsg;
        toast({ title: "Erro ao salvar", description: friendly, variant: "destructive" });
        return;
      }

      const dirtyStudents = studentsEdit.filter((s) => s.dirty);
      for (const student of dirtyStudents) {
        await supabase.from("students").update({ full_name: student.full_name }).eq("id", student.id);
      }
      const dirtyContracts = contractsEdit.filter((c) => c.dirty);
      for (const contract of dirtyContracts) {
        await supabase.from("contracts").update({ contract_number: contract.contract_number || null }).eq("id", contract.id);
      }

      await Promise.resolve(onSaved());
      toast({ title: "Dados atualizados com sucesso!" });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erro ao salvar", description: err instanceof Error ? err.message : "Erro inesperado", variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">Editar Cadastro</DialogTitle>
        </DialogHeader>
        <Button
          type="button" variant="outline" size="sm" className="w-full gap-2"
          onClick={handleSyncAsaas} disabled={syncingAsaas || !user}
        >
          {syncingAsaas ? (<><Loader2 size={14} className="animate-spin" /> Buscando dados no Asaas...</>)
            : (<><RefreshCw size={14} /> Atualizar dados do Asaas</>)}
        </Button>

        <form className="space-y-4" onSubmit={handleSave}>
          <p className="text-xs font-medium text-muted-foreground">Dados Pessoais</p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-foreground text-xs">Nome Completo *</Label>
              <Input className="bg-input border-border text-foreground" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-foreground text-xs">Data de Nascimento</Label>
              <Input type="date" className="bg-input border-border text-foreground" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-foreground text-xs">CPF *</Label>
              <Input className="bg-input border-border text-foreground" value={cpf} onChange={(e) => setCpf(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-foreground text-xs">RG / Identidade</Label>
              <Input className="bg-input border-border text-foreground" value={rg} onChange={(e) => setRg(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-foreground text-xs">Celular (WhatsApp) *</Label>
              <Input className="bg-input border-border text-foreground" placeholder="(31) 99999-9999" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-foreground text-xs">E-mail *</Label>
              <Input type="email" className="bg-input border-border text-foreground" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          {showUnitSelector && (
            <div className="space-y-1">
              <Label className="text-foreground text-xs">Unidade</Label>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger className="bg-input border-border text-foreground"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {units.map((u) => (<SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Separator />
          <p className="text-sm font-semibold text-primary">Endereço</p>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-foreground text-xs">Logradouro *</Label>
              <Input className="bg-input border-border text-foreground" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-foreground text-xs">Número *</Label>
              <Input className="bg-input border-border text-foreground" value={addressNumber} onChange={(e) => setAddressNumber(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-foreground text-xs">Complemento</Label>
              <Input className="bg-input border-border text-foreground" value={complement} onChange={(e) => setComplement(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-foreground text-xs">Bairro *</Label>
              <Input className="bg-input border-border text-foreground" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-foreground text-xs">Cidade *</Label>
              <Input className="bg-input border-border text-foreground" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-foreground text-xs">Estado *</Label>
              <Select value={state} onValueChange={setState}>
                <SelectTrigger className="bg-input border-border text-foreground"><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {ESTADOS_BR.map((uf) => (<SelectItem key={uf} value={uf}>{uf}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-foreground text-xs">CEP *</Label>
              <Input className="bg-input border-border text-foreground" placeholder="00000-000" value={zipCode} onChange={(e) => setZipCode(e.target.value)} />
            </div>
          </div>

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
                      <Input key={student.id} className="bg-input border-border text-foreground"
                        placeholder="Nome do aluno" value={student.full_name}
                        onChange={(e) => handleStudentNameChange(index, e.target.value)} />
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
                      <Input className="bg-input border-border text-foreground" placeholder="Nº do contrato"
                        value={contract.contract_number || ""}
                        onChange={(e) => handleContractNumberChange(index, e.target.value)} />
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">Nenhum contrato vinculado.</p>
                )}
              </div>
            </>
          )}

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? (<><Loader2 size={16} className="animate-spin mr-2" /> Salvando...</>) : "Salvar Alterações"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default UserEditDialog;
