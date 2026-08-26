import { QuickSQLite } from "react-native-quick-sqlite";
import { getDb } from "./db";
import type { ConsultationDraft } from "../../types/api";
import type { ConsultationMode } from "../../store/consultationDraftStore";

export type DraftSyncStatus = "pending" | "syncing" | "synced" | "failed";

export interface DraftQueueRow {
  clientUuid: string;
  payload: ConsultationDraft;
  mode: ConsultationMode;
  status: DraftSyncStatus;
  lastError: string | null;
  updatedAt: string;
}

// Un seul brouillon en file par clientUuid : on écrase le snapshot précédent
// plutôt que d'empiler chaque étape, car le backend rejoue toujours l'état
// complet du formulaire (voir le commentaire sur upsertDraft côté backend) —
// inutile de conserver l'historique intermédiaire en local. Le mode est stocké
// ici comme dans les autres files (photo/consent/submit) : sans lui, le rejeu
// après un redémarrage de l'app (formulaire en mémoire réinitialisé) ne sait
// plus si ce brouillon vient d'un patient ou d'un agent terrain.
export function saveDraftLocally(clientUuid: string, draft: ConsultationDraft, mode: ConsultationMode): void {
  const db = getDb();
  QuickSQLite.execute(
    db,
    `INSERT INTO draft_queue (client_uuid, payload, mode, status, last_error, updated_at)
     VALUES (?, ?, ?, 'pending', NULL, ?)
     ON CONFLICT(client_uuid) DO UPDATE SET payload = excluded.payload, mode = excluded.mode, status = 'pending', last_error = NULL, updated_at = excluded.updated_at;`,
    [clientUuid, JSON.stringify(draft), mode, new Date().toISOString()],
  );
}

export function markDraftStatus(clientUuid: string, status: DraftSyncStatus, lastError?: string): void {
  const db = getDb();
  QuickSQLite.execute(db, `UPDATE draft_queue SET status = ?, last_error = ?, updated_at = ? WHERE client_uuid = ?;`, [
    status,
    lastError ?? null,
    new Date().toISOString(),
    clientUuid,
  ]);
}

export function removeDraftLocally(clientUuid: string): void {
  const db = getDb();
  QuickSQLite.execute(db, `DELETE FROM draft_queue WHERE client_uuid = ?;`, [clientUuid]);
}

// Statut "failed" inclus : au retour de connexion, on retente aussi les envois
// qui avaient échoué la dernière fois (erreur serveur transitoire, timeout…).
export function getPendingDrafts(): DraftQueueRow[] {
  const db = getDb();
  const result = QuickSQLite.execute(
    db,
    `SELECT client_uuid, payload, mode, status, last_error, updated_at FROM draft_queue WHERE status IN ('pending', 'failed');`,
  );
  const rows = result.rows?._array ?? [];
  return rows.map((row: Record<string, string>) => ({
    clientUuid: row.client_uuid,
    payload: JSON.parse(row.payload) as ConsultationDraft,
    mode: (row.mode as ConsultationMode) ?? "patient",
    status: row.status as DraftSyncStatus,
    lastError: row.last_error,
    updatedAt: row.updated_at,
  }));
}

export function countPendingDrafts(): number {
  const db = getDb();
  const result = QuickSQLite.execute(db, `SELECT COUNT(*) as count FROM draft_queue WHERE status IN ('pending', 'failed');`);
  return Number(result.rows?._array?.[0]?.count ?? 0);
}
