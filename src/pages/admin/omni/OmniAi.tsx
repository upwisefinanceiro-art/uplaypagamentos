import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const MODELS = [
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "google/gemini-2.5-pro",
  "openai/gpt-5-mini",
  "openai/gpt-5",
];

export default function OmniAi() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", system_prompt: "Você é o assistente virtual da Uplay. Responda de forma cordial e objetiva.",
    model: "google/gemini-2.5-flash", temperature: 0.7,
  });

  const { data = [] } = useQuery({
    queryKey: ["omni", "ai-prompts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("omni_ai_prompts").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const save = async () => {
    const { data: unit } = await supabase.from("units").select("company_id").eq("id", profile!.unit_id!).maybeSingle();
    const { error } = await supabase.from("omni_ai_prompts").insert({
      company_id: unit!.company_id, unit_id: profile!.unit_id, ...form,
    });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Prompt criado" });
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["omni", "ai-prompts"] });
  };

  const toggle = async (id: string, active: boolean) => {
    await supabase.from("omni_ai_prompts").update({ active }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["omni", "ai-prompts"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Inteligência Artificial</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus size={16} className="mr-1" /> Novo prompt</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Configurar IA</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Modelo</Label>
                <Select value={form.model} onValueChange={(v) => setForm({ ...form, model: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MODELS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Temperatura ({form.temperature})</Label>
                <Input type="number" step="0.1" min="0" max="2" value={form.temperature} onChange={(e) => setForm({ ...form, temperature: Number(e.target.value) })} />
              </div>
              <div><Label>Prompt do sistema</Label>
                <Textarea rows={8} value={form.system_prompt} onChange={(e) => setForm({ ...form, system_prompt: e.target.value })} />
              </div>
              <Button onClick={save} className="w-full">Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <p className="text-sm text-muted-foreground">
        Os prompts ficam preparados. A IA só responde quando o prompt está ativo E a integração tem "IA respondendo" ligada.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {data.map(p => (
          <div key={p.id} className="border border-border bg-card rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{p.name}</p>
              <Switch checked={p.active ?? false} onCheckedChange={(v) => toggle(p.id, v)} />
            </div>
            <p className="text-xs text-muted-foreground">{p.model} · temp {p.temperature}</p>
            <p className="text-xs text-muted-foreground line-clamp-3">{p.system_prompt}</p>
          </div>
        ))}
        {data.length === 0 && <p className="col-span-full text-center text-muted-foreground p-10 border border-dashed rounded-lg">Nenhum prompt configurado.</p>}
      </div>
    </div>
  );
}
