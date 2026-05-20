import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error(JSON.stringify({ error: 'missing_env', hasUrl: !!url, hasKey: !!key }, null, 2));
  process.exit(1);
}

const email = process.argv[2];
const password = process.argv[3] || '12345678';
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function summarizeError(error) {
  if (!error) return null;
  return {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
    status: error.status,
    name: error.name,
  };
}

const result = { email };
const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
result.signIn = { ok: !signInError, error: summarizeError(signInError), userId: signInData.user?.id ?? null };
if (signInError || !signInData.user) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const userId = signInData.user.id;
const { data: roles, error: rolesError } = await supabase.from('user_roles').select('role').eq('user_id', userId);
result.roles = { count: roles?.length ?? 0, rows: roles, error: summarizeError(rolesError) };

const { data: teachers, error: teacherError } = await supabase
  .from('school_teachers')
  .select('id,unit_id,company_id,active,email')
  .eq('profile_id', userId)
  .eq('active', true);
result.teachers = { count: teachers?.length ?? 0, rows: teachers, error: summarizeError(teacherError) };

const teacherIds = (teachers ?? []).map(t => t.id);
if (teacherIds.length) {
  const { data: units, error: unitError } = await supabase.from('units_public').select('id,name,status').in('id', [...new Set((teachers ?? []).map(t => t.unit_id))]);
  result.units = { count: units?.length ?? 0, rows: units, error: summarizeError(unitError) };

  const { data: lessons, error: lessonsError } = await supabase.from('school_lessons').select('id,teacher_id,unit_id,status,starts_at').in('teacher_id', teacherIds).limit(5);
  result.lessons = { count: lessons?.length ?? 0, sample: lessons, error: summarizeError(lessonsError) };

  const { data: classIds, error: lessonIdsError } = await supabase.from('school_lessons').select('class_id,course_id').in('teacher_id', teacherIds).limit(50);
  const ids = [...new Set((classIds ?? []).map(x => x.class_id).filter(Boolean))];
  const courseIds = [...new Set((classIds ?? []).map(x => x.course_id).filter(Boolean))];
  result.lessonRefs = { error: summarizeError(lessonIdsError), classIds: ids.length, courseIds: courseIds.length };
  if (ids.length) {
    const { data: classes, error: classesError } = await supabase.from('school_classes').select('id,name').in('id', ids).limit(5);
    result.classes = { count: classes?.length ?? 0, error: summarizeError(classesError) };
  }
  if (courseIds.length) {
    const { data: courses, error: coursesError } = await supabase.from('courses').select('id,name').in('id', courseIds).limit(5);
    result.courses = { count: courses?.length ?? 0, error: summarizeError(coursesError) };
  }
}

console.log(JSON.stringify(result, null, 2));
