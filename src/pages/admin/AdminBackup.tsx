import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Loader2, ShieldAlert, Upload, Database, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface BackupLog {
  id: string;
  created_at: string;
  action: string;
  status: string;
  format: string;
  size_bytes: number;
  total_records: number;
  scope: string;
  performed_by_name: string | null;
  error_message: string | null;
}

const formatBytes = (b: number) => {
  if (!b) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${(b / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

const AdminBackup = () => {
  const { hasRole, profile } = useAuth();
  const isSuper = hasRole("SUPER_ADMIN");
  const [logs, setLogs] = useState<BackupLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadLogs = async () => {
    setLoadingLogs(true);
    const { data, error } = await supabase
      .from("backup_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) toast.error("Erro ao carregar logs: " + error.message);
    setLogs((data as BackupLog[]) ?? []);
    setLoadingLogs(false);
  };

  useEffect(() => { loadLogs(); }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sessão expirada");

      const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/generate-backup`;
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Falha ao gerar backup");
      }
      const blob = await res.blob();
      const dl = document.createElement("a");
      dl.href = URL.createObjectURL(blob);
      dl.download = `uplay-backup-${new Date().toISOString().slice(0, 10)}.json`;
      dl.click();
      URL.revokeObjectURL(dl.href);
      toast.success("Backup gerado e baixado com sucesso");
      loadLogs();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setConfirmText("");
    setRestoreOpen(true);
  };

  const handleRestore = async () => {
    if (!pendingFile || confirmText !== "RESTAURAR") {
      toast.error("Digite RESTAURAR para confirmar");
      return;
    }
    setRestoring(true);
    try {
      const text = await pendingFile.text();
      const backup = JSON.parse(text);

      const { data, error } = await supabase.functions.invoke("restore-backup", {
        body: { confirmation: "RESTAURAR", backup },
      });
      if (error) throw error;
      if (data?.errors?.length) {
        toast.warning(`Restaurado com ${data.errors.length} erros. Veja logs.`);
      } else {
        toast.success(`Backup restaurado: ${data?.restored ?? 0} registros`);
      }
      setRestoreOpen(false);
      setPendingFile(null);
      setConfirmText("");
      if (fileRef.current) fileRef.current.value = "";
      loadLogs();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="h-6 w-6 text-primary" /> Backup & Restauração
        </h1>
        <p className="text-sm text-muted-foreground">
          Exporte uma cópia segura dos dados do sistema. Chaves de API e tokens são automaticamente excluídos.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Download className="h-5 w-5" /> Gerar Backup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {isSuper
                ? "Como SUPER_ADMIN, será exportado o banco completo."
                : "Como ADMIN_MASTER, será exportado apenas os dados da sua empresa."}
            </p>
            <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
              <li>Clientes, contratos, cobranças, pagamentos</li>
              <li>Unidades, estoque, movimentações</li>
              <li>Notificações, logs de auditoria, planos SaaS</li>
            </ul>
            <Button onClick={handleGenerate} disabled={generating} className="w-full">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {generating ? "Gerando..." : "Gerar Backup Agora"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Upload className="h-5 w-5" /> Restaurar Backup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isSuper ? (
              <>
                <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30">
                  <ShieldAlert className="h-4 w-4 text-destructive mt-0.5" />
                  <p className="text-xs text-destructive">
                    Operação crítica. Sobrescreve registros existentes (UPSERT por id). Faça um backup atual antes.
                  </p>
                </div>
                <Input ref={fileRef} type="file" accept="application/json" onChange={handleFileChange} disabled={restoring} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Apenas SUPER_ADMIN pode restaurar backups. Solicite suporte se precisar restaurar dados.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="h-5 w-5" /> Histórico de Backups
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingLogs ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum backup registrado ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Escopo</TableHead>
                    <TableHead>Registros</TableHead>
                    <TableHead>Tamanho</TableHead>
                    <TableHead>Por</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs">{new Date(l.created_at).toLocaleString("pt-BR")}</TableCell>
                      <TableCell>
                        <Badge variant={l.action === "RESTORE" ? "destructive" : "secondary"}>{l.action}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          l.status === "SUCCESS" || l.status === "RESTORED" ? "default" :
                          l.status === "ERROR" ? "destructive" : "outline"
                        }>{l.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{l.scope}</TableCell>
                      <TableCell className="text-xs">{l.total_records.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-xs">{formatBytes(l.size_bytes)}</TableCell>
                      <TableCell className="text-xs">{l.performed_by_name ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" /> Confirmar restauração
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação sobrescreve registros existentes pelo conteúdo do backup. Não pode ser desfeita.
              Digite <span className="font-mono font-bold">RESTAURAR</span> para confirmar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>Confirmação</Label>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RESTAURAR" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring} onClick={() => { setPendingFile(null); if (fileRef.current) fileRef.current.value = ""; }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleRestore(); }}
              disabled={restoring || confirmText !== "RESTAURAR"}
              className="bg-destructive hover:bg-destructive/90"
            >
              {restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : "Restaurar agora"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminBackup;
