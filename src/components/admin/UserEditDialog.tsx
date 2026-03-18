import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface UserEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { id: string; full_name: string; cpf: string; phone: string | null; unit_id: string | null } | null;
  units: { id: string; name: string }[];
  onSaved: () => void;
  showUnitSelector?: boolean;
}

const UserEditDialog = ({ open, onOpenChange, user, units, onSaved, showUnitSelector = false }: UserEditDialogProps) => {
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [phone, setPhone] = useState("");
  const [unitId, setUnitId] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { user: authUser } = useAuth();

  useEffect(() => {
    if (user) {
      setName(user.full_name);
      setCpf(user.cpf);
      setPhone(user.phone || "");
      setUnitId(user.unit_id || "");
    }
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !name || !cpf) {
      toast({ title: "Nome e CPF são obrigatórios", variant: "destructive" });
      return;
    }

    setSaving(true);

    const updateData: Record<string, any> = { full_name: name, cpf, phone: phone || null };
    if (showUnitSelector && unitId) updateData.unit_id = unitId;

    const { error } = await supabase.from("profiles").update(updateData).eq("id", user.id);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      action: "EDIT",
      target_table: "profiles",
      target_id: user.id,
      performed_by: authUser!.id,
      details: updateData,
    });

    toast({ title: "Dados atualizados com sucesso!" });
    setSaving(false);
    onOpenChange(false);
    onSaved();
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
          <div className="space-y-2">
            <Label className="text-foreground">CPF *</Label>
            <Input className="bg-input border-border text-foreground" value={cpf} onChange={(e) => setCpf(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-foreground">Telefone</Label>
            <Input className="bg-input border-border text-foreground" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          {showUnitSelector && (
            <div className="space-y-2">
              <Label className="text-foreground">Unidade</Label>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger className="bg-input border-border text-foreground"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? <><Loader2 size={16} className="animate-spin mr-2" /> Salvando...</> : "Salvar Alterações"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default UserEditDialog;
