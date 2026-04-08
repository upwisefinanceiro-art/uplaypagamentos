import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { secret, user_id, new_email, password, delete_user_id } = await req.json();
    if (secret !== "ensinup-seed-2024") {
      return new Response(JSON.stringify({ error: "Invalid secret" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Delete duplicate user if specified
    if (delete_user_id) {
      await admin.auth.admin.deleteUser(delete_user_id);
      await admin.from("profiles").delete().eq("id", delete_user_id);
      await admin.from("user_roles").delete().eq("user_id", delete_user_id);
    }

    // Fix original user: unban + update email + reset password
    if (user_id) {
      const { error } = await admin.auth.admin.updateUserById(user_id, {
        email: new_email,
        password: password || "12345678",
        email_confirm: true,
        ban_duration: "none",
      });
      if (error) throw error;
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erro" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
