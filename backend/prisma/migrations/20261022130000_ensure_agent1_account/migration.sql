-- Migration de données ponctuelle : le compte Firebase agent1@gmail.com existait
-- sans fiche AdminUser en production, donc /admin/me répondait 403 et l'app
-- renvoyait l'agent à l'accueil. Idempotente : réactive la fiche si elle existe
-- (par email ou par UID Firebase), sinon la crée.
UPDATE "admin_users"
SET "firebase_uid" = 'hCoAGoIX8OUCY6jJT0iJbIsuRnw1', "role" = 'agent', "is_active" = true, "updated_at" = NOW()
WHERE "email" = 'agent1@gmail.com' OR "firebase_uid" = 'hCoAGoIX8OUCY6jJT0iJbIsuRnw1';

INSERT INTO "admin_users" ("id", "firebase_uid", "nom", "prenom", "email", "role", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), 'hCoAGoIX8OUCY6jJT0iJbIsuRnw1', 'Terrain', 'Agent', 'agent1@gmail.com', 'agent', true, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "admin_users"
  WHERE "email" = 'agent1@gmail.com' OR "firebase_uid" = 'hCoAGoIX8OUCY6jJT0iJbIsuRnw1'
);
