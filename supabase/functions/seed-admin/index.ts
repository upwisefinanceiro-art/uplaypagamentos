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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { secret } = await req.json();
    if (secret !== "ensinup-seed-2024") {
      return new Response(JSON.stringify({ error: "Invalid secret" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if admin already exists
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("cpf", "00000000000")
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ message: "Admin já existe", user_id: existing.id }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create admin user
    const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
      email: "00000000000@ensinup.app",
      password: "admin123",
      email_confirm: true,
      user_metadata: { cpf: "00000000000", full_name: "Admin Master" },
    });

    if (error) throw error;

    // Assign ADMIN_MASTER role
    await supabaseAdmin.from("user_roles").insert({
      user_id: newUser.user.id,
      role: "ADMIN_MASTER",
    });

    return new Response(
      JSON.stringify({ success: true, user_id: newUser.user.id, email: "00000000000@ensinup.app", password: "admin123" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
