import { QuickSQLite } from "react-native-quick-sqlite";

const DB_NAME = "dermato_offline.sqlite";

let initialized = false;

// Ouverture paresseuse : le module natif QuickSQLite ne doit être touché qu'au
// premier besoin réel (jamais à l'import du fichier), sinon le simple fait
// d'importer ce module côté test ou avant le montage natif complet fait planter
// l'app (voir le message d'erreur "Base quick-sqlite module not found").
export function getDb(): string {
  if (!initialized) {
    QuickSQLite.open(DB_NAME);
    QuickSQLite.execute(
      DB_NAME,
      `CREATE TABLE IF NOT EXISTS draft_queue (
        client_uuid TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'patient',
        status TEXT NOT NULL,
        last_error TEXT,
        updated_at TEXT NOT NULL
      );`,
    );
    // Migration pour les installs existantes (table déjà créée avant l'ajout de la
    // colonne mode) : sans elle, un brouillon en file ne savait plus s'il venait
    // d'un patient ou d'un agent terrain après un redémarrage de l'app — voir
    // syncEngine.ts, qui rejouait tout par défaut sur le point d'accès "patient".
    try {
      QuickSQLite.execute(DB_NAME, `ALTER TABLE draft_queue ADD COLUMN mode TEXT NOT NULL DEFAULT 'patient';`);
    } catch {
      // Colonne déjà présente (install récente créée directement avec le CREATE TABLE ci-dessus).
    }
    // consultation_id est NULL tant que le brouillon associé n'a pas encore
    // synchronisé (voir photoQueue.ts#setPhotoConsultationId, appelé par
    // syncEngine dès qu'un brouillon obtient son id serveur) — une photo prise
    // hors ligne, avant même que le dossier existe côté serveur, doit pouvoir
    // être mise en file sans bloquer l'utilisateur.
    QuickSQLite.execute(
      DB_NAME,
      `CREATE TABLE IF NOT EXISTS photo_queue (
        id TEXT PRIMARY KEY,
        client_uuid TEXT NOT NULL,
        consultation_id TEXT,
        mode TEXT NOT NULL,
        slot TEXT NOT NULL,
        local_uri TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        status TEXT NOT NULL,
        last_error TEXT,
        updated_at TEXT NOT NULL
      );`,
    );
    // Miroir de photo_queue : le consentement peut être donné avant même que le
    // dossier existe côté serveur (formulaire rempli hors ligne du début à la
    // fin) — consultation_id reste NULL jusqu'à ce que syncPendingDrafts le
    // renseigne (voir consentQueue.ts#setConsentConsultationId), sans quoi
    // l'étape "Consentement & disponibilités" bloquait toujours hors ligne.
    QuickSQLite.execute(
      DB_NAME,
      `CREATE TABLE IF NOT EXISTS consent_queue (
        client_uuid TEXT PRIMARY KEY,
        consultation_id TEXT,
        mode TEXT NOT NULL,
        consent_text_version TEXT NOT NULL,
        status TEXT NOT NULL,
        last_error TEXT,
        updated_at TEXT NOT NULL
      );`,
    );
    // Miroir de consent_queue : l'envoi final (SummaryScreen) doit lui aussi
    // pouvoir être mis en file hors ligne — sans quoi un agent terrain sans
    // connexion pendant toute sa tournée ne pourrait jamais "terminer" un
    // dossier et enchaîner sur le suivant (voir syncEngine.ts#syncPendingSubmits,
    // rejoué en dernier : le serveur exige que les photos soient déjà reçues).
    QuickSQLite.execute(
      DB_NAME,
      `CREATE TABLE IF NOT EXISTS submit_queue (
        client_uuid TEXT PRIMARY KEY,
        consultation_id TEXT,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        last_error TEXT,
        updated_at TEXT NOT NULL
      );`,
    );
    initialized = true;
  }
  return DB_NAME;
}
