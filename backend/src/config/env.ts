import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  CORS_ORIGINS: z.string().default(""),

  DATABASE_URL: z.string().min(1, "DATABASE_URL est requis"),

  FIREBASE_PROJECT_ID: z.string().min(1, "FIREBASE_PROJECT_ID est requis"),

  // Compte de service : utilisé pour Sheets (export, optionnel — ne fait
  // qu'ajouter des lignes à un fichier déjà existant, pas de souci de quota).
  GOOGLE_SERVICE_ACCOUNT_KEY_FILE: z.string().min(1, "GOOGLE_SERVICE_ACCOUNT_KEY_FILE est requis"),
  GOOGLE_SHEETS_ID: z.string().optional(),
  GOOGLE_SHEETS_TAB_NAME: z.string().default("Dossiers"),

  // OAuth2 (compte Google personnel) : utilisé pour Drive (photos, requis) — les
  // comptes de service n'ont plus de quota de stockage pour CRÉER des fichiers
  // (voir services/googleDrive.ts). Refresh token obtenu une fois via
  // scripts/authorizeDrive.mjs, voir README pour la procédure complète.
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1, "GOOGLE_OAUTH_CLIENT_ID est requis"),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1, "GOOGLE_OAUTH_CLIENT_SECRET est requis"),
  GOOGLE_OAUTH_REFRESH_TOKEN: z.string().min(1, "GOOGLE_OAUTH_REFRESH_TOKEN est requis"),
  GOOGLE_DRIVE_PHOTOS_FOLDER_ID: z.string().min(1, "GOOGLE_DRIVE_PHOTOS_FOLDER_ID est requis"),
  // Dossier séparé pour les conclusions médicales rédigées par l'admin (voir
  // services/pdfReport.ts#uploadConclusionPdfToDrive) — jamais mélangées aux photos/
  // rapports patient, pour que le dermatologue retrouve ses propres comptes-rendus
  // sans les noyer dans les pièces jointes brutes des patients.
  GOOGLE_DRIVE_RESPONSES_FOLDER_ID: z.string().min(1, "GOOGLE_DRIVE_RESPONSES_FOLDER_ID est requis"),

  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(300),

  // Optionnels : tant qu'ils ne sont pas renseignés, l'envoi de SMS est
  // silencieusement désactivé (voir services/sms.ts) plutôt que de bloquer le
  // démarrage du serveur — utile en dev/test où Africa's Talking n'est pas configuré.
  // AT_USERNAME="sandbox" pour tester gratuitement (voir dashboard Africa's Talking).
  AT_API_KEY: z.string().optional(),
  AT_USERNAME: z.string().optional(),
  AT_SENDER_ID: z.string().optional(),
});

// Échoue au démarrage plutôt qu'au premier appel — une config manquante ne doit
// jamais se découvrir en production au milieu d'une requête patient.
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Configuration invalide :", parsed.error.flatten().fieldErrors);
  throw new Error("Variables d'environnement manquantes ou invalides — voir .env.example");
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
  isProduction: parsed.data.NODE_ENV === "production",
};
