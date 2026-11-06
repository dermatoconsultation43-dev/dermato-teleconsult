-- Migration de données : fiches AdminUser (rôle agent) des comptes terrain
-- agent2 à agent10 et agent@gmail.com, dont les comptes Firebase ont été créés le 2026-11-06.
-- Idempotente, même schéma que 20261022130000_ensure_agent1_account.

UPDATE "admin_users"
SET "firebase_uid" = 'YhOoo0GyX8SZWMORUGLiD7n8jq02', "role" = 'agent', "is_active" = true, "updated_at" = NOW()
WHERE "email" = 'agent2@gmail.com' OR "firebase_uid" = 'YhOoo0GyX8SZWMORUGLiD7n8jq02';

INSERT INTO "admin_users" ("id", "firebase_uid", "nom", "prenom", "email", "role", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), 'YhOoo0GyX8SZWMORUGLiD7n8jq02', 'Terrain', 'Agent 2', 'agent2@gmail.com', 'agent', true, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "admin_users"
  WHERE "email" = 'agent2@gmail.com' OR "firebase_uid" = 'YhOoo0GyX8SZWMORUGLiD7n8jq02'
);

UPDATE "admin_users"
SET "firebase_uid" = 'hYd2cjBCEzR7Mp8tazKHp8j5UkN2', "role" = 'agent', "is_active" = true, "updated_at" = NOW()
WHERE "email" = 'agent3@gmail.com' OR "firebase_uid" = 'hYd2cjBCEzR7Mp8tazKHp8j5UkN2';

INSERT INTO "admin_users" ("id", "firebase_uid", "nom", "prenom", "email", "role", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), 'hYd2cjBCEzR7Mp8tazKHp8j5UkN2', 'Terrain', 'Agent 3', 'agent3@gmail.com', 'agent', true, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "admin_users"
  WHERE "email" = 'agent3@gmail.com' OR "firebase_uid" = 'hYd2cjBCEzR7Mp8tazKHp8j5UkN2'
);

UPDATE "admin_users"
SET "firebase_uid" = 'wyq5b41wukcpvX9dEy3KAOzow3o2', "role" = 'agent', "is_active" = true, "updated_at" = NOW()
WHERE "email" = 'agent4@gmail.com' OR "firebase_uid" = 'wyq5b41wukcpvX9dEy3KAOzow3o2';

INSERT INTO "admin_users" ("id", "firebase_uid", "nom", "prenom", "email", "role", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), 'wyq5b41wukcpvX9dEy3KAOzow3o2', 'Terrain', 'Agent 4', 'agent4@gmail.com', 'agent', true, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "admin_users"
  WHERE "email" = 'agent4@gmail.com' OR "firebase_uid" = 'wyq5b41wukcpvX9dEy3KAOzow3o2'
);

UPDATE "admin_users"
SET "firebase_uid" = 'zU0Rvf9zLffxjsful9vsG7kQ1WC3', "role" = 'agent', "is_active" = true, "updated_at" = NOW()
WHERE "email" = 'agent5@gmail.com' OR "firebase_uid" = 'zU0Rvf9zLffxjsful9vsG7kQ1WC3';

INSERT INTO "admin_users" ("id", "firebase_uid", "nom", "prenom", "email", "role", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), 'zU0Rvf9zLffxjsful9vsG7kQ1WC3', 'Terrain', 'Agent 5', 'agent5@gmail.com', 'agent', true, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "admin_users"
  WHERE "email" = 'agent5@gmail.com' OR "firebase_uid" = 'zU0Rvf9zLffxjsful9vsG7kQ1WC3'
);

UPDATE "admin_users"
SET "firebase_uid" = 'nReTVFuvpldLGx7k8mMlM2v4owv1', "role" = 'agent', "is_active" = true, "updated_at" = NOW()
WHERE "email" = 'agent6@gmail.com' OR "firebase_uid" = 'nReTVFuvpldLGx7k8mMlM2v4owv1';

INSERT INTO "admin_users" ("id", "firebase_uid", "nom", "prenom", "email", "role", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), 'nReTVFuvpldLGx7k8mMlM2v4owv1', 'Terrain', 'Agent 6', 'agent6@gmail.com', 'agent', true, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "admin_users"
  WHERE "email" = 'agent6@gmail.com' OR "firebase_uid" = 'nReTVFuvpldLGx7k8mMlM2v4owv1'
);

UPDATE "admin_users"
SET "firebase_uid" = 'hjZOUV2wBSX2VmwEL5yIvgysYFB2', "role" = 'agent', "is_active" = true, "updated_at" = NOW()
WHERE "email" = 'agent7@gmail.com' OR "firebase_uid" = 'hjZOUV2wBSX2VmwEL5yIvgysYFB2';

INSERT INTO "admin_users" ("id", "firebase_uid", "nom", "prenom", "email", "role", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), 'hjZOUV2wBSX2VmwEL5yIvgysYFB2', 'Terrain', 'Agent 7', 'agent7@gmail.com', 'agent', true, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "admin_users"
  WHERE "email" = 'agent7@gmail.com' OR "firebase_uid" = 'hjZOUV2wBSX2VmwEL5yIvgysYFB2'
);

UPDATE "admin_users"
SET "firebase_uid" = 'VP19s2HaUNNp9UwbUkxJtcQRGxP2', "role" = 'agent', "is_active" = true, "updated_at" = NOW()
WHERE "email" = 'agent8@gmail.com' OR "firebase_uid" = 'VP19s2HaUNNp9UwbUkxJtcQRGxP2';

INSERT INTO "admin_users" ("id", "firebase_uid", "nom", "prenom", "email", "role", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), 'VP19s2HaUNNp9UwbUkxJtcQRGxP2', 'Terrain', 'Agent 8', 'agent8@gmail.com', 'agent', true, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "admin_users"
  WHERE "email" = 'agent8@gmail.com' OR "firebase_uid" = 'VP19s2HaUNNp9UwbUkxJtcQRGxP2'
);

UPDATE "admin_users"
SET "firebase_uid" = 'MxJKNxoadOUQPCmr5pgieTschvc2', "role" = 'agent', "is_active" = true, "updated_at" = NOW()
WHERE "email" = 'agent9@gmail.com' OR "firebase_uid" = 'MxJKNxoadOUQPCmr5pgieTschvc2';

INSERT INTO "admin_users" ("id", "firebase_uid", "nom", "prenom", "email", "role", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), 'MxJKNxoadOUQPCmr5pgieTschvc2', 'Terrain', 'Agent 9', 'agent9@gmail.com', 'agent', true, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "admin_users"
  WHERE "email" = 'agent9@gmail.com' OR "firebase_uid" = 'MxJKNxoadOUQPCmr5pgieTschvc2'
);

UPDATE "admin_users"
SET "firebase_uid" = 'lrQCfsswNKOiLPv5jVuXjERFdtm1', "role" = 'agent', "is_active" = true, "updated_at" = NOW()
WHERE "email" = 'agent10@gmail.com' OR "firebase_uid" = 'lrQCfsswNKOiLPv5jVuXjERFdtm1';

INSERT INTO "admin_users" ("id", "firebase_uid", "nom", "prenom", "email", "role", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), 'lrQCfsswNKOiLPv5jVuXjERFdtm1', 'Terrain', 'Agent 10', 'agent10@gmail.com', 'agent', true, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "admin_users"
  WHERE "email" = 'agent10@gmail.com' OR "firebase_uid" = 'lrQCfsswNKOiLPv5jVuXjERFdtm1'
);

UPDATE "admin_users"
SET "firebase_uid" = '2dNsKR7qQBe3XnHyNOKRKlAisM23', "role" = 'agent', "is_active" = true, "updated_at" = NOW()
WHERE "email" = 'agent@gmail.com' OR "firebase_uid" = '2dNsKR7qQBe3XnHyNOKRKlAisM23';

INSERT INTO "admin_users" ("id", "firebase_uid", "nom", "prenom", "email", "role", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), '2dNsKR7qQBe3XnHyNOKRKlAisM23', 'Terrain', 'Agent', 'agent@gmail.com', 'agent', true, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM "admin_users"
  WHERE "email" = 'agent@gmail.com' OR "firebase_uid" = '2dNsKR7qQBe3XnHyNOKRKlAisM23'
);
