
-- Fix partner profile: activate and update email
UPDATE profiles 
SET active = true, email = 'upwisevespasiano@gmail.com'
WHERE id = '41ce548c-981f-49e0-a588-be1d53537fc3';

-- Fix partner role: change from RESPONSAVEL to ADMIN_UNIDADE
UPDATE user_roles 
SET role = 'ADMIN_UNIDADE'
WHERE user_id = '41ce548c-981f-49e0-a588-be1d53537fc3' AND role = 'RESPONSAVEL';
