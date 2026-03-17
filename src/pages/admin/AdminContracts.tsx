import { useState, useEffect, useMemo } from "react";
import { Plus, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface ContractRow {
  id: string;
  description: string;
  responsible_name: string | null;
  cpf: string | null;
  course_real_value: number | null;
  punctuality_discount: number | null;
  final_value_with_discount: number | null;
  installments: number;
  first_due_date: string | null;
  start_date: string;
  status: string;
  payment_method: string | null;
  unit_id: string;
  responsible_id: string;
  student_id: string;
  units: { name: string } | null;
  students: { full_name: string } | null;
}

interface StudentRow {
  id: string;
  full_name: string;
  responsible_id: string;
  unit_id: string;
}

interface ResponsibleRow {
  id: string;
  full_name: string;
  cpf: string;
  phone: string | null;
  unit_id: string | null;
  asaas_customer_id: string | null;
}

interface UnitRow {
  id: string;
  name: string;
}

const ESTADOS_BR = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA",
  "PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
];

const AdminContracts = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [responsibles, setResponsibles] = useState<ResponsibleRow[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<"form" | "summary">("form");
  const { toast } = useToast();
  const { profile, hasRole } = useAuth();

  // Form state
  const [responsibleId, setResponsibleId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [responsibleName, setResponsibleName] = useState("");
  const [rg, setRg] = useState("");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [firstDueDate, setFirstDueDate] = useState("");
  const [courseRealValue, setCourseRealValue] = useState("");
  const [punctualityDiscount, setPunctualityDiscount] = useState("0");
  const [installments, setInstallments] = useState("1");
  const [dueDay, setDueDay] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");

  const selectedResponsible = responsibles.find(r => r.id === responsibleId);
  const selectedStudent = students.find(s => s.id === studentId);
  const unitId = selectedResponsible?.unit_id || "";
  const unitName = units.find(u => u.id === unitId)?.name || "";

  const filteredStudents = useMemo(() => {
    if (!responsibleId) return [];
    return students.filter(s => s.responsible_id === responsibleId);
  }, [responsibleId, students]);

  const realValue = parseFloat(courseRealValue) || 0;
  const discount = parseFloat(punctualityDiscount) || 0;
  const finalValue = Math.max(0, realValue - discount);
  const installmentRealValue = realValue > 0 && parseInt(installments) > 0 ? realValue / parseInt(installments) : 0;
  const installmentFinalValue = finalValue > 0 && parseInt(installments) > 0 ? finalValue / parseInt(installments) : 0;
  const installmentDiscount = installmentRealValue - installmentFinalValue;

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [contractsRes, studentsRes, responsiblesRes, unitsRes] = await Promise.all([
      supabase.from("contracts").select("*, units(name), students(full_name)").order("created_at", { ascending: false }),
      supabase.from("students").select("id, full_name, responsible_id, unit_id").eq("active", true),
      supabase.from("profiles").select("id, full_name, cpf, phone, unit_id, asaas_customer_id"),
      supabase.from("units").select("id, name").eq("active", true),
    ]);
    if (contractsRes.data) setContracts(contractsRes.data as any);
    if (studentsRes.data) setStudents(studentsRes.data);
    if (responsiblesRes.data) setResponsibles(responsiblesRes.data as any);
    if (unitsRes.data) setUnits(unitsRes.data);
    setLoading(false);
  };

  const handleResponsibleChange = (id: string) => {
    setResponsibleId(id);
    setStudentId("");
    const resp = responsibles.find(r => r.id === id);
    if (resp) {
      setResponsibleName(resp.full_name);
      setCpf(resp.cpf || "");
      setPhone(resp.phone || "");
    }
  };

  const resetForm = () => {
    setResponsibleId(""); setStudentId(""); setResponsibleName(""); setRg("");
    setCpf(""); setPhone(""); setEmail(""); setAddress(""); setAddressNumber("");
    setComplement(""); setNeighborhood(""); setCity(""); setState(""); setZipCode("");
    setDescription(""); setStartDate(""); setFirstDueDate(""); setCourseRealValue("");
    setPunctualityDiscount("0"); setInstallments("1"); setDueDay(""); setPaymentMethod("");
    setNotes(""); setStep("form");
  };

  const canProceedToSummary = () => {
    return responsibleId && studentId && cpf && description && startDate && firstDueDate
      && courseRealValue && parseInt(installments) > 0 && paymentMethod && unitId;
  };

  const handleSave = async () => {
    if (!unitId || !responsibleId || !studentId) return;
    setSaving(true);
    try {
      const numInstallments = parseInt(installments);
      // Insert contract
      const { data: contract, error: contractErr } = await supabase.from("contracts").insert({
        unit_id: unitId,
        responsible_id: responsibleId,
        student_id: studentId,
        description,
        total_value: realValue,
        installments: numInstallments,
        start_date: startDate,
        first_due_date: firstDueDate,
        course_real_value: realValue,
        punctuality_discount: discount,
        final_value_with_discount: finalValue,
        due_day: parseInt(dueDay) || parseInt(firstDueDate.split("-")[2]) || 1,
        payment_method: paymentMethod,
        responsible_name: responsibleName,
        rg,
        cpf,
        phone,
        email,
        address,
        address_number: addressNumber,
        complement,
        neighborhood,
        city,
        state,
        zip_code: zipCode,
        notes,
        status: "ACTIVE",
      }).select("id").single();

      if (contractErr) throw contractErr;

      // Generate installments
      const baseDueDate = new Date(firstDueDate + "T12:00:00");
      const payments = [];
      for (let i = 0; i < numInstallments; i++) {
        const dueDate = new Date(baseDueDate);
        dueDate.setMonth(dueDate.getMonth() + i);
        payments.push({
          contract_id: contract.id,
          unit_id: unitId,
          responsible_id: responsibleId,
          installment_number: i + 1,
          due_date: dueDate.toISOString().split("T")[0],
          value: installmentFinalValue,
          original_value: installmentRealValue,
          punctuality_discount: installmentDiscount,
          final_value: installmentFinalValue,
          payment_method: paymentMethod,
          status: "PENDING",
        });
      }

      const { error: paymentsErr } = await supabase.from("payments").insert(payments);
      if (paymentsErr) throw paymentsErr;

      toast({ title: "Contrato criado!", description: `${numInstallments} parcelas geradas com sucesso.` });
      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (err: any) {
      toast({ title: "Erro ao criar contrato", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Contratos</h1>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus size={16} className="mr-2" />
              Novo Contrato
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-foreground">
                {step === "form" ? "Novo Contrato" : "Resumo do Contrato"}
              </DialogTitle>
            </DialogHeader>

            {step === "form" ? (
              <div className="space-y-6">
                {/* Section A: Dados do Responsável */}
                <div>
                  <h3 className="text-sm font-semibold text-primary mb-3">A. Dados do Responsável</h3>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-foreground text-xs">Responsável *</Label>
                      <Select value={responsibleId} onValueChange={handleResponsibleChange}>
                        <SelectTrigger className="bg-input border-border text-foreground"><SelectValue placeholder="Selecione o responsável" /></SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          {responsibles.map(r => (
                            <SelectItem key={r.id} value={r.id}>{r.full_name} - {r.cpf}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {responsibleId && (
                      <>
                        <div className="space-y-1">
                          <Label className="text-foreground text-xs">Aluno *</Label>
                          <Select value={studentId} onValueChange={setStudentId}>
                            <SelectTrigger className="bg-input border-border text-foreground"><SelectValue placeholder="Selecione o aluno" /></SelectTrigger>
                            <SelectContent className="bg-card border-border">
                              {filteredStudents.map(s => (
                                <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {filteredStudents.length === 0 && (
                            <p className="text-xs text-destructive">Nenhum aluno vinculado a este responsável.</p>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-foreground text-xs">Nome Completo</Label>
                            <Input className="bg-input border-border text-foreground" value={responsibleName} onChange={e => setResponsibleName(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-foreground text-xs">CPF *</Label>
                            <Input className="bg-input border-border text-foreground" value={cpf} onChange={e => setCpf(e.target.value)} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-foreground text-xs">RG / Identidade</Label>
                            <Input className="bg-input border-border text-foreground" value={rg} onChange={e => setRg(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-foreground text-xs">Telefone</Label>
                            <Input className="bg-input border-border text-foreground" value={phone} onChange={e => setPhone(e.target.value)} />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-foreground text-xs">E-mail</Label>
                          <Input className="bg-input border-border text-foreground" type="email" value={email} onChange={e => setEmail(e.target.value)} />
                        </div>
                        <Separator className="my-2" />
                        <p className="text-xs text-muted-foreground font-medium">Endereço</p>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="col-span-2 space-y-1">
                            <Label className="text-foreground text-xs">Logradouro</Label>
                            <Input className="bg-input border-border text-foreground" value={address} onChange={e => setAddress(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-foreground text-xs">Número</Label>
                            <Input className="bg-input border-border text-foreground" value={addressNumber} onChange={e => setAddressNumber(e.target.value)} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-foreground text-xs">Complemento</Label>
                            <Input className="bg-input border-border text-foreground" value={complement} onChange={e => setComplement(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-foreground text-xs">Bairro</Label>
                            <Input className="bg-input border-border text-foreground" value={neighborhood} onChange={e => setNeighborhood(e.target.value)} />
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <Label className="text-foreground text-xs">Cidade</Label>
                            <Input className="bg-input border-border text-foreground" value={city} onChange={e => setCity(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-foreground text-xs">Estado</Label>
                            <Select value={state} onValueChange={setState}>
                              <SelectTrigger className="bg-input border-border text-foreground"><SelectValue placeholder="UF" /></SelectTrigger>
                              <SelectContent className="bg-card border-border">
                                {ESTADOS_BR.map(uf => (
                                  <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-foreground text-xs">CEP</Label>
                            <Input className="bg-input border-border text-foreground" value={zipCode} onChange={e => setZipCode(e.target.value)} />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Section B: Dados Financeiros */}
                <div>
                  <h3 className="text-sm font-semibold text-primary mb-3">B. Dados Financeiros do Contrato</h3>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-foreground text-xs">Curso / Descrição *</Label>
                      <Input className="bg-input border-border text-foreground" placeholder="Ex: Informática Básica" value={description} onChange={e => setDescription(e.target.value)} />
                    </div>
                    {unitId && (
                      <div className="p-2 rounded-md bg-muted">
                        <p className="text-xs text-muted-foreground">Unidade: <span className="font-semibold text-foreground">{unitName}</span></p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-foreground text-xs">Data de Início *</Label>
                        <Input className="bg-input border-border text-foreground" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-foreground text-xs">Data do 1º Vencimento *</Label>
                        <Input className="bg-input border-border text-foreground" type="date" value={firstDueDate} onChange={e => setFirstDueDate(e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-foreground text-xs">Método de Pagamento *</Label>
                      <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                        <SelectTrigger className="bg-input border-border text-foreground"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem value="PIX">PIX</SelectItem>
                          <SelectItem value="BOLETO">Boleto</SelectItem>
                          <SelectItem value="CARD">Cartão</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Section C: Parcelamento */}
                <div>
                  <h3 className="text-sm font-semibold text-primary mb-3">C. Parcelamento</h3>
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-foreground text-xs">Valor Real do Curso *</Label>
                        <Input className="bg-input border-border text-foreground" type="number" step="0.01" min="0" placeholder="0,00" value={courseRealValue} onChange={e => setCourseRealValue(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-foreground text-xs">Desc. Pontualidade</Label>
                        <Input className="bg-input border-border text-foreground" type="number" step="0.01" min="0" placeholder="0,00" value={punctualityDiscount} onChange={e => setPunctualityDiscount(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-foreground text-xs">Valor Final</Label>
                        <Input className="bg-input border-border text-foreground" readOnly value={fmt(finalValue)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-foreground text-xs">Nº de Parcelas *</Label>
                        <Input className="bg-input border-border text-foreground" type="number" min="1" value={installments} onChange={e => setInstallments(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-foreground text-xs">Dia de Vencimento</Label>
                        <Input className="bg-input border-border text-foreground" type="number" min="1" max="28" placeholder="Herda do 1º vencimento" value={dueDay} onChange={e => setDueDay(e.target.value)} />
                      </div>
                    </div>
                    {realValue > 0 && parseInt(installments) > 0 && (
                      <div className="p-3 rounded-md bg-muted space-y-1">
                        <p className="text-xs text-muted-foreground">Parcela sem desconto: <span className="font-semibold text-foreground">{fmt(installmentRealValue)}</span></p>
                        {discount > 0 && (
                          <p className="text-xs text-muted-foreground">Desc. pontualidade/parcela: <span className="font-semibold text-destructive">-{fmt(installmentDiscount)}</span></p>
                        )}
                        <p className="text-xs text-muted-foreground">Parcela com desconto: <span className="font-semibold text-primary">{fmt(installmentFinalValue)}</span></p>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Section D: Observações */}
                <div>
                  <h3 className="text-sm font-semibold text-primary mb-3">D. Observações</h3>
                  <Textarea className="bg-input border-border text-foreground" placeholder="Observações do contrato..." value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
                </div>

                <Button
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                  disabled={!canProceedToSummary()}
                  onClick={() => setStep("summary")}
                >
                  Revisar Contrato
                </Button>
              </div>
            ) : (
              /* Summary Step */
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-muted space-y-3">
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <span className="text-muted-foreground">Responsável:</span>
                    <span className="text-foreground font-medium">{responsibleName}</span>
                    <span className="text-muted-foreground">CPF:</span>
                    <span className="text-foreground">{cpf}</span>
                    <span className="text-muted-foreground">Aluno:</span>
                    <span className="text-foreground font-medium">{selectedStudent?.full_name}</span>
                    <span className="text-muted-foreground">Unidade:</span>
                    <span className="text-foreground font-medium">{unitName}</span>
                  </div>
                  <Separator />
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <span className="text-muted-foreground">Curso:</span>
                    <span className="text-foreground font-medium">{description}</span>
                    <span className="text-muted-foreground">Valor Real:</span>
                    <span className="text-foreground">{fmt(realValue)}</span>
                    {discount > 0 && (
                      <>
                        <span className="text-muted-foreground">Desc. Pontualidade:</span>
                        <span className="text-destructive">-{fmt(discount)}</span>
                      </>
                    )}
                    <span className="text-muted-foreground">Valor Final:</span>
                    <span className="text-primary font-bold">{fmt(finalValue)}</span>
                    <span className="text-muted-foreground">Parcelas:</span>
                    <span className="text-foreground">{installments}x de {fmt(installmentFinalValue)}</span>
                    <span className="text-muted-foreground">1º Vencimento:</span>
                    <span className="text-foreground">{firstDueDate ? new Date(firstDueDate + "T12:00:00").toLocaleDateString("pt-BR") : ""}</span>
                    <span className="text-muted-foreground">Pagamento:</span>
                    <span className="text-foreground">{paymentMethod}</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setStep("form")}>
                    Voltar e Editar
                  </Button>
                  <Button
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                    disabled={saving}
                    onClick={handleSave}
                  >
                    {saving ? <><Loader2 className="animate-spin mr-2" size={16} />Salvando...</> : "Confirmar e Gerar Parcelas"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Contracts List */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={24} /></div>
      ) : contracts.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">Nenhum contrato encontrado.</div>
      ) : (
        <div className="space-y-3">
          {contracts.map((c) => (
            <div key={c.id} className="glass-card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{c.description}</h3>
                  <p className="text-xs text-muted-foreground">
                    {c.responsible_name || "—"} • {(c.units as any)?.name || "—"} • Aluno: {(c.students as any)?.full_name || "—"}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${c.status === "ACTIVE" ? "status-paid" : "status-cancelled"}`}>
                  {c.status === "ACTIVE" ? "Ativo" : c.status}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                {c.course_real_value && c.punctuality_discount && c.punctuality_discount > 0 ? (
                  <>
                    <span className="line-through">{fmt(c.course_real_value)}</span>
                    <span className="text-primary font-medium">{fmt(c.final_value_with_discount || 0)}</span>
                  </>
                ) : (
                  <span>{fmt(c.course_real_value || c.total_value || 0)}</span>
                )}
                <span>• {c.installments}x</span>
                <span>• {c.payment_method || "—"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminContracts;
