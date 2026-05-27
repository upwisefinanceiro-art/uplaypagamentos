import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const TRIGGERS = ["message_received", "conversation_opened", "keyword_match", "no_reply_timeout", "tag_added"];

export default function OmniAutomations() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("message_received");
  const [actionsText, setActionsText] = useState(`[\n  { "type": "send_message", "content": "Olá! Recebemos sua mensagem 👋" }\n]`);

  const { data = [] } = useQuery({
    queryKey: ["omni", "automations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("omni_automation_rules").select("*").order("priority");
      if (error) throw error;
      return data;
    },
  });

  const save = async () => {
    try {
      const actions = JSON.parse(actionsText);
      const { data: unit } = await supabase.from("units").select("id,company_id").eq("id", profile!.unit_id!).maybeSingle();
      const { error } = await supabase.from("omni_automation_rules").insert({
        company_id: unit!.company_id, unit_id: unit!.id,
        name, trigger: trigger as never, actions, active: true,
      });
      if (error) throw error;
      toast({ title: "Automação criada" });
      setOpen(false); setName("");
      qc.invalidateQueries({ queryKey: ["omni", "automations"] });
    } catch (e) {
      toast({ title: "Erro", description: String((e as Error).message), variant: "destructive" });
    }
  };

  const toggle = async (id: string, active: boolean) => {
    await supabase.from("omni_automation_rules").update({ active }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["omni", "automations"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Automações</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus size={16} className="mr-1" /> Nova regra</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova automação</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><Label>Gatilho</Label>
                <Select value={trigger} onValueChange={setTrigger}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TRIGGERS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Ações (JSON)</Label>
                <Textarea rows={6} value={actionsText} onChange={(e) => setActionsText(e.target.value)} className="font-mono text-xs" />
              </div>
              <Button onClick={save} className="w-full">Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-2">Nome</th>
              <th className="p-2">Gatilho</th>
              <th className="p-2">Prioridade</th>
              <th className="p-2">Ativa</th>
            </tr>
          </thead>
          <tbody>
            {data.map(r => (
              <tr key={r.id} className="border-t border-border/50">
                <td className="p-2">{r.name}</td>
                <td className="p-2"><span className="text-xs bg-muted px-2 py-0.5 rounded">{r.trigger}</span></td>
                <td className="p-2">{r.priority}</td>
                <td className="p-2"><Switch checked={r.active ?? false} onCheckedChange={(v) => toggle(r.id, v)} /></td>
              </tr>
            ))}
            {data.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Nenhuma regra ainda</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
