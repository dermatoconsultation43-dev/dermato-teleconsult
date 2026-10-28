import { QuickSQLite } from "react-native-quick-sqlite";
import { getDb } from "./db";
import type { AdminProfile, Patient } from "../../types/api";

export type CachedProfile = { kind: "patient"; profile: Patient } | { kind: "admin"; profile: AdminProfile };

// Enregistré à chaque résolution réussie de /patients/me ou /admin/me (voir
// RootNavigator#resolveProfile), relu seulement quand le serveur est injoignable :
// un agent dont le téléphone a redémarré sur le terrain doit pouvoir continuer à
// saisir ses dossiers. Le rôle reste vérifié par le backend à chaque requête — ce
// cache ne sert qu'à choisir les écrans à afficher hors ligne.
export function saveCachedProfile(firebaseUid: string, cached: CachedProfile): void {
  const db = getDb();
  QuickSQLite.execute(
    db,
    `INSERT INTO profile_cache (firebase_uid, kind, payload, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(firebase_uid) DO UPDATE SET kind = excluded.kind, payload = excluded.payload, updated_at = excluded.updated_at;`,
    [firebaseUid, cached.kind, JSON.stringify(cached.profile), new Date().toISOString()],
  );
}

export function getCachedProfile(firebaseUid: string): CachedProfile | null {
  const db = getDb();
  const result = QuickSQLite.execute(db, `SELECT kind, payload FROM profile_cache WHERE firebase_uid = ?;`, [firebaseUid]);
  const row = result.rows?._array?.[0] as { kind: string; payload: string } | undefined;
  if (!row) return null;
  return row.kind === "admin"
    ? { kind: "admin", profile: JSON.parse(row.payload) as AdminProfile }
    : { kind: "patient", profile: JSON.parse(row.payload) as Patient };
}

// Appelé à la déconnexion : un téléphone partagé ne doit pas rouvrir hors ligne la
// session du compte précédent.
export function clearCachedProfiles(): void {
  const db = getDb();
  QuickSQLite.execute(db, `DELETE FROM profile_cache;`);
}
