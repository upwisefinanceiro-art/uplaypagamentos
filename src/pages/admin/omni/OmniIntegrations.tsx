import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, QrCode, Wifi, WifiOff, AlertCircle, Loader2, Copy } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const PROVIDERS = [
  { id: "EVOLUTION_API", label: "WhatsApp (Evolution API)", channel: "WHATSAPP" },
  { id: "META_WHATSAPP_CLOUD", label: "WhatsApp (Meta Cloud)", channel: "WHATSAPP" },
  { id: "META_INSTAGRAM", label: "Instagram (Meta)", channel: "INSTAGRAM" },
  { id: "LANDING_FORM", label: "Landing Page", channel: "LANDING_PAGE" },
];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export default function OmniIntegrations() {
  const { profile, hasRole } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [qrFor, setQrFor] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState("EVOLUTION_API");

  const { data: integrations = [] } = useQuery({
    queryKey: ["omni", "integrations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("omni_integrations").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createIntegration = async () => {
    if (!profile?.unit_id && !hasRole("SUPER_ADMIN")) {
      toast({ title: "Sem unidade vinculada", variant: "destructive" });
      return;
    }
    const def = PROVIDERS.find(p => p.id === provider)!;
    const credentials: Record<string, string> = {};
    if (provider === "EVOLUTION_API") {
      credentials.base_url = form.base_url ?? "";
      credentials.instance = form.instance ?? "";
      credentials.api_key = form.api_key ?? "";
    } else if (provider === "META_WHATSAPP_CLOUD" || provider === "META_INSTAGRAM") {
      credentials.phone_number_id = form.phone_number_id ?? "";
      credentials.access_token = form.access_token ?? "";
      credentials.verify_token = form.verify_token ?? "";
    }
    const { data: unit } = await supabase.from("units").select("id,company_id").eq("id", profile!.unit_id!).maybeSingle();
    const { error } = await supabase.from("omni_integrations").insert({
      company_id: unit!.company_id, unit_id: unit!.id,
      provider: def.id as never, channel: def.channel as never,
      display_name: form.display_name ?? def.label,
      credentials, status: "disconnected",
    });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Integração criada" });
    setOpen(false); setForm({});
    qc.invalidateQueries({ queryKey: ["omni", "integrations"] });
  };

  const testConn = async (id: string) => {
    const { data, error } = await supabase.functions.invoke("omni-integration-test", { body: { integration_id: id } });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else toast({ title: "Resultado", description: JSON.stringify(data).slice(0, 200) });
    qc.invalidateQueries({ queryKey: ["omni", "integrations"] });
  };

  const openQr = async (id: string) => {
    setQrFor(id); setQrLoading(true); setQrImage(null);
    const { data } = await supabase.functions.invoke("omni-integration-qr", { body: { integration_id: id } });
    setQrImage((data as { qr?: string })?.qr ?? null);
    setQrLoading(false);
  };

  const toggleAI = async (id: string, ai_enabled: boolean) => {
    await supabase.from("omni_integrations").update({ ai_enabled }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["omni", "integrations"] });
  };

  const webhookUrl = (i: { id: string; provider: string; webhook_secret: string }) => {
    const slug = i.provider === "EVOLUTION_API" ? "omni-evolution-webhook"
      : i.provider === "LANDING_FORM" ? "omni-landing-webhook"
      : "omni-meta-webhook";
    return `${SUPABASE_URL}/functions/v1/${slug}?integration_id=${i.id}&secret=${i.webhook_secret}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Integrações</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus size={16} className="mr-1" /> Nova integração</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Conectar canal</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Provedor</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nome de exibição</Label>
                <Input value={form.display_name ?? ""} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
              </div>
              {provider === "EVOLUTION_API" && (
                <>
                  <div><Label>Base URL</Label><Input placeholder="https://evolution.exemplo.com" value={form.base_url ?? ""} onChange={(e) => setForm({ ...form, base_url: e.target.value })} /></div>
                  <div><Label>Instância</Label><Input value={form.instance ?? ""} onChange={(e) => setForm({ ...form, instance: e.target.value })} /></div>
                  <div><Label>API Key</Label><Input type="password" value={form.api_key ?? ""} onChange={(e) => setForm({ ...form, api_key: e.target.value })} /></div>
                </>
              )}
              {(provider === "META_WHATSAPP_CLOUD" || provider === "META_INSTAGRAM") && (
                <>
                  <div><Label>Phone Number ID / Page ID</Label><Input value={form.phone_number_id ?? ""} onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })} /></div>
                  <div><Label>Access Token</Label><Input type="password" value={form.access_token ?? ""} onChange={(e) => setForm({ ...form, access_token: e.target.value })} /></div>
                  <div><Label>Verify Token (webhook)</Label><Input value={form.verify_token ?? ""} onChange={(e) => setForm({ ...form, verify_token: e.target.value })} /></div>
                </>
              )}
              <Button onClick={createIntegration} className="w-full">Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {integrations.map((i) => {
          const StatusIcon = i.status === "connected" ? Wifi : i.status === "error" ? AlertCircle : WifiOff;
          const color = i.status === "connected" ? "text-emerald-500"
            : i.status === "error" ? "text-destructive"
            : i.status === "qr_pending" ? "text-amber-500"
            : "text-muted-foreground";
          return (
            <div key={i.id} className="border border-border bg-card rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{i.display_name}</p>
                  <p className="text-xs text-muted-foreground">{i.provider}</p>
                </div>
                <div className={`flex items-center gap-1 text-xs ${color}`}>
                  <StatusIcon size={14} /> {i.status}
                </div>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Último evento: {i.last_event_at ? new Date(i.last_event_at).toLocaleString("pt-BR") : "—"}</p>
                {i.error_message && <p className="text-destructive break-all">{i.error_message}</p>}
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">IA respondendo</span>
                <Switch checked={!!i.ai_enabled} onCheckedChange={(v) => toggleAI(i.id, v)} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => testConn(i.id)}>Testar</Button>
                {i.provider === "EVOLUTION_API" && (
                  <Button size="sm" variant="outline" onClick={() => openQr(i.id)}><QrCode size={14} className="mr-1" /> QR Code</Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => {
                  navigator.clipboard.writeText(webhookUrl(i));
                  toast({ title: "URL do webhook copiada" });
                }}><Copy size={14} className="mr-1" /> Webhook</Button>
              </div>
              <Badge variant="outline" className="text-[10px] break-all whitespace-normal h-auto py-1">
                {webhookUrl(i)}
              </Badge>
            </div>
          );
        })}
        {integrations.length === 0 && (
          <div className="col-span-full text-center text-sm text-muted-foreground p-10 border border-dashed rounded-lg">
            Nenhuma integração criada ainda.
          </div>
        )}
      </div>

      <Dialog open={!!qrFor} onOpenChange={(o) => { if (!o) { setQrFor(null); setQrImage(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Conectar WhatsApp via QR Code</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center gap-3 py-4">
            {qrLoading && <Loader2 className="animate-spin" />}
            {qrImage && (qrImage.startsWith("data:") || qrImage.startsWith("http"))
              ? <img src={qrImage} alt="QR" className="w-64 h-64" />
              : qrImage ? <img src={`data:image/png;base64,${qrImage}`} alt="QR" className="w-64 h-64" /> : null}
            {!qrLoading && !qrImage && <p className="text-sm text-muted-foreground">Sem QR disponível. Verifique a integração.</p>}
            <p className="text-xs text-muted-foreground text-center">Abra o WhatsApp → Aparelhos conectados → Conectar aparelho</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
