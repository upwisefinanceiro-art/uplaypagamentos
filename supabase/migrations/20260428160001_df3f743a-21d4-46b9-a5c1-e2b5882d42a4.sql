-- Mesclar perfis duplicados de Idalyna Maria dos Passos
-- Perfil ativo: cfce9952-a4d9-4e77-be2d-30a423ca0539 (CPF errado 08422281690)
-- Perfil duplicado: 0e72c49e-5ae4-4e5d-9769-f0280893d266 (CPF correto 08722281690, contrato cancelado)

-- 1. Migrar contrato cancelado e quaisquer dependências do perfil duplicado para o ativo
UPDATE public.contracts SET responsible_id = 'cfce9952-a4d9-4e77-be2d-30a423ca0539' WHERE responsible_id = '0e72c49e-5ae4-4e5d-9769-f0280893d266';
UPDATE public.students SET responsible_id = 'cfce9952-a4d9-4e77-be2d-30a423ca0539' WHERE responsible_id = '0e72c49e-5ae4-4e5d-9769-f0280893d266';
UPDATE public.payments SET responsible_id = 'cfce9952-a4d9-4e77-be2d-30a423ca0539' WHERE responsible_id = '0e72c49e-5ae4-4e5d-9769-f0280893d266';
UPDATE public.client_notifications SET responsible_id = 'cfce9952-a4d9-4e77-be2d-30a423ca0539' WHERE responsible_id = '0e72c49e-5ae4-4e5d-9769-f0280893d266';
UPDATE public.delivery_notifications SET responsible_id = 'cfce9952-a4d9-4e77-be2d-30a423ca0539' WHERE responsible_id = '0e72c49e-5ae4-4e5d-9769-f0280893d266';
UPDATE public.payment_inconsistencies SET responsible_id = 'cfce9952-a4d9-4e77-be2d-30a423ca0539' WHERE responsible_id = '0e72c49e-5ae4-4e5d-9769-f0280893d266';
UPDATE public.stock_movements SET responsible_id = 'cfce9952-a4d9-4e77-be2d-30a423ca0539' WHERE responsible_id = '0e72c49e-5ae4-4e5d-9769-f0280893d266';
UPDATE public.whatsapp_message_logs SET responsible_id = 'cfce9952-a4d9-4e77-be2d-30a423ca0539' WHERE responsible_id = '0e72c49e-5ae4-4e5d-9769-f0280893d266';

-- 2. Limpar o CPF do perfil duplicado para liberar o índice unique
UPDATE public.profiles SET cpf = '' WHERE id = '0e72c49e-5ae4-4e5d-9769-f0280893d266';

-- 3. Corrigir o CPF do perfil ativo para o valor correto
UPDATE public.profiles SET cpf = '08722281690' WHERE id = 'cfce9952-a4d9-4e77-be2d-30a423ca0539';

-- 4. Remover roles e o perfil duplicado
DELETE FROM public.user_roles WHERE user_id = '0e72c49e-5ae4-4e5d-9769-f0280893d266';
DELETE FROM public.profiles WHERE id = '0e72c49e-5ae4-4e5d-9769-f0280893d266';