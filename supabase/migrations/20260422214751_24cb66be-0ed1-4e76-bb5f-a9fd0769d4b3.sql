
-- Remove dependências antes de excluir a parcela duplicada
DELETE FROM public.stock_movements WHERE payment_id = 'd08b7bad-57cb-407d-aa08-9c6cb2538899';
DELETE FROM public.delivery_notifications WHERE payment_id = 'd08b7bad-57cb-407d-aa08-9c6cb2538899';
DELETE FROM public.whatsapp_message_logs WHERE payment_id = 'd08b7bad-57cb-407d-aa08-9c6cb2538899';

-- Remove a parcela duplicada (a que NÃO tem asaas_payment_id)
DELETE FROM public.payments WHERE id = 'd08b7bad-57cb-407d-aa08-9c6cb2538899';
