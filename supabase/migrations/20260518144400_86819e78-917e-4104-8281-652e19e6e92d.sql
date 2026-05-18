
-- 1) Excluir as 26 cobranças duplicadas "informática" (já canceladas no Asaas)
DELETE FROM stock_movements
 WHERE payment_id IN (
   SELECT id FROM payments
   WHERE contract_id = '5bd31b0f-b484-40f9-888b-a3bbc2d825c5'
     AND description ILIKE 'informática%'
 );

DELETE FROM delivery_notifications
 WHERE payment_id IN (
   SELECT id FROM payments
   WHERE contract_id = '5bd31b0f-b484-40f9-888b-a3bbc2d825c5'
     AND description ILIKE 'informática%'
 );

DELETE FROM payment_inconsistencies
 WHERE payment_id IN (
   SELECT id FROM payments
   WHERE contract_id = '5bd31b0f-b484-40f9-888b-a3bbc2d825c5'
     AND description ILIKE 'informática%'
 );

DELETE FROM payments
 WHERE contract_id = '5bd31b0f-b484-40f9-888b-a3bbc2d825c5'
   AND description ILIKE 'informática%';

-- 2) Vincular as 26 "Mensalidade - Parcela X/13" reais ao contrato
UPDATE payments
   SET contract_id = '5bd31b0f-b484-40f9-888b-a3bbc2d825c5',
       student_id  = 'c27aa7da-af2e-4ea8-81d3-3288ccf70060'
 WHERE responsible_id = (SELECT responsible_id FROM contracts WHERE id='5bd31b0f-b484-40f9-888b-a3bbc2d825c5')
   AND contract_id IS NULL
   AND description ILIKE 'Mensalidade - Parcela%';

-- 3) Unificar aluno Bruno: manter c27aa7da, migrar refs do 77304a41, deletar os 3 redundantes
UPDATE payments SET student_id = 'c27aa7da-af2e-4ea8-81d3-3288ccf70060'
 WHERE student_id IN ('77304a41-5eb5-4f90-bf1d-6d82ba749fb1',
                      '78e7c7ab-9caf-45d9-bb40-3e4392019988',
                      '3a2715eb-b88d-45ba-aa3b-2fde7dc5e8bb');

UPDATE delivery_notifications SET student_id = 'c27aa7da-af2e-4ea8-81d3-3288ccf70060'
 WHERE student_id IN ('77304a41-5eb5-4f90-bf1d-6d82ba749fb1',
                      '78e7c7ab-9caf-45d9-bb40-3e4392019988',
                      '3a2715eb-b88d-45ba-aa3b-2fde7dc5e8bb');

DELETE FROM students
 WHERE id IN ('77304a41-5eb5-4f90-bf1d-6d82ba749fb1',
              '78e7c7ab-9caf-45d9-bb40-3e4392019988',
              '3a2715eb-b88d-45ba-aa3b-2fde7dc5e8bb');
