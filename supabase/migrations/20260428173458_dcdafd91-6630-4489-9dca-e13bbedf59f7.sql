-- Cursos por unidade
CREATE TABLE public.courses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  suggested_value NUMERIC NOT NULL DEFAULT 0,
  suggested_installments INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_courses_unit ON public.courses(unit_id);

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admin full access to courses"
ON public.courses FOR ALL TO authenticated
USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

CREATE POLICY "Admin Master can manage company courses"
ON public.courses FOR ALL TO authenticated
USING (has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND unit_id IN (SELECT id FROM units WHERE company_id = get_user_company_id(auth.uid())))
WITH CHECK (has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND unit_id IN (SELECT id FROM units WHERE company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Admin Unidade can manage unit courses"
ON public.courses FOR ALL TO authenticated
USING (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()))
WITH CHECK (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND unit_id = get_user_unit_id(auth.uid()));

CREATE TRIGGER update_courses_updated_at
BEFORE UPDATE ON public.courses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Vínculo N:N curso ↔ apostila (stock_items)
CREATE TABLE public.course_apostilas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  stock_item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  unit_value NUMERIC NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (course_id, stock_item_id)
);

CREATE INDEX idx_course_apostilas_course ON public.course_apostilas(course_id);
CREATE INDEX idx_course_apostilas_item ON public.course_apostilas(stock_item_id);

ALTER TABLE public.course_apostilas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admin full access to course_apostilas"
ON public.course_apostilas FOR ALL TO authenticated
USING (has_role(auth.uid(), 'SUPER_ADMIN'::app_role))
WITH CHECK (has_role(auth.uid(), 'SUPER_ADMIN'::app_role));

CREATE POLICY "Admin Master can manage company course_apostilas"
ON public.course_apostilas FOR ALL TO authenticated
USING (has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND course_id IN (SELECT c.id FROM courses c JOIN units u ON c.unit_id = u.id WHERE u.company_id = get_user_company_id(auth.uid())))
WITH CHECK (has_role(auth.uid(), 'ADMIN_MASTER'::app_role) AND course_id IN (SELECT c.id FROM courses c JOIN units u ON c.unit_id = u.id WHERE u.company_id = get_user_company_id(auth.uid())));

CREATE POLICY "Admin Unidade can manage unit course_apostilas"
ON public.course_apostilas FOR ALL TO authenticated
USING (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND course_id IN (SELECT id FROM courses WHERE unit_id = get_user_unit_id(auth.uid())))
WITH CHECK (has_role(auth.uid(), 'ADMIN_UNIDADE'::app_role) AND course_id IN (SELECT id FROM courses WHERE unit_id = get_user_unit_id(auth.uid())));