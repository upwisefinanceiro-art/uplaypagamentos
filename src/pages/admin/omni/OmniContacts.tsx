import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Input } from "@/components/ui/input";

export default function OmniContacts() {
  const [search, setSearch] = useState("");
  const { data = [] } = useQuery({
    queryKey: ["omni", "contacts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("omni_contacts").select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data;
    },
  });
  const filtered = data.filter(c =>
    !search || c.full_name?.toLowerCase().includes(search.toLowerCase()) || c.phone_e164?.includes(search)
  );
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Contatos</h1>
      <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="p-2">Nome</th>
              <th className="p-2">Telefone</th>
              <th className="p-2">Instagram</th>
              <th className="p-2">E-mail</th>
              <th className="p-2">Origem</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} className="border-t border-border/50">
                <td className="p-2">{c.full_name}</td>
                <td className="p-2">{c.phone_e164 ?? "—"}</td>
                <td className="p-2">{c.instagram_handle ?? "—"}</td>
                <td className="p-2">{c.email ?? "—"}</td>
                <td className="p-2"><span className="text-xs bg-muted px-2 py-0.5 rounded">{c.origin ?? "—"}</span></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Sem contatos</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
