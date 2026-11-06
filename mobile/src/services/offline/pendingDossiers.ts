import { QuickSQLite } from "react-native-quick-sqlite";
import { getDb } from "./db";

// Vue "par dossier" des quatre files locales (brouillon, consentement, photos,
// envoi final) : un dossier en attente y occupe plusieurs lignes, or l'agent ne
// raisonne qu'en dossiers. C'est aussi ce qui est compté dans le bandeau.

export interface QueueRow {
  kind: "draft" | "consent" | "photo" | "submit";
  clientUuid: string;
  consultationId: string | null;
  status: string;
  lastError: string | null;
  updatedAt: string;
  payload: string | null;
}

export interface PendingDossier {
  clientUuid: string;
  /** Code du patient, ou null pour un dossier mis en file avant la version 1.4. */
  label: string | null;
  photoCount: number;
  /** L'agent a terminé la saisie : l'envoi final est en file. */
  readyToSend: boolean;
  /** Raison pour laquelle le dossier n'est pas parti, en clair. */
  error: string | null;
  updatedAt: string;
}

const ORPHAN_ERROR =
  "Les informations de ce dossier ne sont plus sur ce téléphone et il n'est jamais arrivé sur le serveur. Il faut le ressaisir.";

function labelFromPayload(payload: string | null): string | null {
  if (!payload) return null;
  try {
    const name = (JSON.parse(payload) as { nomComplet?: string }).nomComplet?.trim();
    return name || null;
  } catch {
    return null;
  }
}

export function groupPendingRows(rows: QueueRow[], labels: Record<string, string>): PendingDossier[] {
  const byDossier = new Map<string, QueueRow[]>();
  for (const row of rows) {
    byDossier.set(row.clientUuid, [...(byDossier.get(row.clientUuid) ?? []), row]);
  }

  const dossiers = [...byDossier.entries()].map(([clientUuid, group]): PendingDossier => {
    const draft = group.find((r) => r.kind === "draft");
    // Sans brouillon en file ni id serveur, plus rien ne peut débloquer ces lignes.
    const orphan = !draft && group.some((r) => r.consultationId === null);
    const failed = group.find((r) => r.status === "failed" && r.lastError);
    return {
      clientUuid,
      label: labels[clientUuid] ?? labelFromPayload(draft?.payload ?? null),
      photoCount: group.filter((r) => r.kind === "photo").length,
      readyToSend: group.some((r) => r.kind === "submit"),
      error: orphan ? ORPHAN_ERROR : (failed?.lastError ?? null),
      updatedAt: group.map((r) => r.updatedAt).sort().at(-1) ?? "",
    };
  });
  return dossiers.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}

const ACTIVE = `status IN ('pending', 'failed', 'syncing')`;

function readQueueRows(): QueueRow[] {
  const result = QuickSQLite.execute(
    getDb(),
    `SELECT 'draft' AS kind, client_uuid, NULL AS consultation_id, status, last_error, updated_at, payload FROM draft_queue WHERE ${ACTIVE}
     UNION ALL SELECT 'consent', client_uuid, consultation_id, status, last_error, updated_at, NULL FROM consent_queue WHERE ${ACTIVE}
     UNION ALL SELECT 'photo', client_uuid, consultation_id, status, last_error, updated_at, NULL FROM photo_queue WHERE ${ACTIVE}
     UNION ALL SELECT 'submit', client_uuid, consultation_id, status, last_error, updated_at, NULL FROM submit_queue WHERE ${ACTIVE};`,
  );
  return (result.rows?._array ?? []).map((row: Record<string, string | null>) => ({
    kind: row.kind as QueueRow["kind"],
    clientUuid: String(row.client_uuid),
    consultationId: row.consultation_id,
    status: String(row.status),
    lastError: row.last_error,
    updatedAt: String(row.updated_at),
    payload: row.payload,
  }));
}

function readLabels(): Record<string, string> {
  const result = QuickSQLite.execute(getDb(), `SELECT client_uuid, label FROM dossier_labels;`);
  const labels: Record<string, string> = {};
  for (const row of result.rows?._array ?? []) labels[String(row.client_uuid)] = String(row.label);
  return labels;
}

export function listPendingDossiers(): PendingDossier[] {
  return groupPendingRows(readQueueRows(), readLabels());
}

export function countPendingDossiers(): number {
  return new Set(readQueueRows().map((r) => r.clientUuid)).size;
}

// Le brouillon sort de la file dès qu'il est synchronisé : sans cette copie, un
// dossier dont seules les photos restent à envoyer n'aurait plus de nom à afficher.
export function rememberDossierLabel(clientUuid: string, label: string | undefined): void {
  const trimmed = label?.trim();
  if (!trimmed) return;
  QuickSQLite.execute(
    getDb(),
    `INSERT INTO dossier_labels (client_uuid, label) VALUES (?, ?)
     ON CONFLICT(client_uuid) DO UPDATE SET label = excluded.label;`,
    [clientUuid, trimmed],
  );
}

// Dernier recours pour un dossier définitivement refusé : sans ça, il reste en
// attente pour toujours et l'agent n'a aucun moyen d'en sortir.
export function discardDossier(clientUuid: string): void {
  const db = getDb();
  for (const table of ["draft_queue", "consent_queue", "photo_queue", "submit_queue", "dossier_labels"]) {
    QuickSQLite.execute(db, `DELETE FROM ${table} WHERE client_uuid = ?;`, [clientUuid]);
  }
}
