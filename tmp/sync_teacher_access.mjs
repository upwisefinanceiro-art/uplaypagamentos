import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const adminEmail = 'herbertmaxx@gmail.com';
const adminPassword = 'Davialicesteliane92852420be@#';
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: adminSession, error: adminError } = await supabase.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
if (adminError || !adminSession.session) {
  console.error(JSON.stringify({ step: 'admin_login', error: adminError }, null, 2));
  process.exit(1);
}

const teachers = [
  { id: '2f20af4d-2c04-4216-b6e4-30a1ffaacfae', email: 'albertomachado83@hotmail.com', full_name: 'Alberto N MAchado', phone: '31988219633' },
  { id: '1adc4e90-0ebf-4f03-96fc-bfc0a003ef6b', email: 'josephaugusto456@gmail.com', full_name: 'Joseph Augusto', phone: '31998881542' },
  { id: '57e0a4d0-1c1b-4f99-aeae-75951c6e31f7', email: 'josephaugusto456@gmail.com', full_name: 'Joseph Augusto', phone: '31998881542' },
  { id: '94659703-f48c-400e-8286-611dde0df8d8', email: 'corgozinhosara@gmail.com', full_name: 'Sara S Corgozinho', phone: '31995141153' },
];

const results = [];
for (const t of teachers) {
  const { data, error } = await supabase.functions.invoke('create-teacher-user', {
    body: { teacher_id: t.id, email: t.email, full_name: t.full_name, phone: t.phone, password: '12345678' },
  });
  results.push({ teacher: t.full_name, email: t.email, ok: !error && !data?.error, status: data?.status, login_valid: data?.login_valid, error: error?.message || data?.error || null });
}

console.log(JSON.stringify(results, null, 2));
