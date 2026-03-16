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

    const { secret, email, password, full_name } = await req.json();
    if (secret !== "ensinup-seed-2024") {
      return new Response(JSON.stringify({ error: "Invalid secret" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminEmail = email || "00000000000@ensinup.app";
    const adminPassword = password || "admin123";
    const adminName = full_name || "Admin Master";

    // Check if user with this email already exists
    const { data: { users: existingUsers } } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.find((u: any) => u.email === adminEmail);

    if (existingUser) {
      return new Response(JSON.stringify({ message: "Usuário já existe", user_id: existingUser.id, email: adminEmail }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create admin user
    const { data: newUser, error } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { full_name: adminName },
    });

    if (error) throw error;

    // Assign ADMIN_MASTER role
    await supabaseAdmin.from("user_roles").insert({
      user_id: newUser.user.id,
      role: "ADMIN_MASTER",
    });

    return new Response(
      JSON.stringify({ success: true, user_id: newUser.user.id, email: adminEmail }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
