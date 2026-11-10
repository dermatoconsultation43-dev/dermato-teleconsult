import { Readable } from "node:stream";
import { drive } from "./googleAuth.js";
import { env } from "../config/env.js";

// Remplace services/storage.ts (Google Cloud Storage) — voir décision produit :
// les photos vivent dans un dossier Google Drive partagé avec le compte de
// service, plutôt qu'un bucket Cloud Storage séparé. Les octets transitent par ce
// serveur (pas d'upload direct depuis le mobile vers Drive, pour ne jamais exposer
// la clé du compte de service côté client).
export const ALLOWED_PHOTO_MIME_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/webp": "webp",
};

export const MAX_PHOTO_SIZE_BYTES = 25 * 1024 * 1024; // 25 Mo — voir services/storage.ts (valeur reprise à l'identique).

// Même début que le PDF du dossier (voir pdfReport.ts#buildReportFileName) : triées
// par nom dans Drive, les photos se regroupent par dossier et une recherche
// "000083" retrouve à la fois le PDF et ses photos.
export function buildPhotoFileName(
  consultation: { refNumber: number; nomComplet: string | null },
  photoNumber: number,
  mimeType: string,
): string {
  const extension = ALLOWED_PHOTO_MIME_TYPES[mimeType] ?? "bin";
  const ref = String(consultation.refNumber).padStart(6, "0");
  const nom = sanitizeFileNamePart(consultation.nomComplet?.trim() || "Sans nom", 40);
  return `${ref} - ${nom} - photo ${photoNumber}.${extension}`;
}

// Filtre les caractères interdits/gênants dans un nom de fichier (Drive comme
// Windows) et plafonne la longueur — un motif de consultation ou un code patient
// est un champ libre, potentiellement long ou farci de ponctuation. Partagé avec
// pdfReport.ts pour que les PDF et les photos d'un dossier portent le même début.
export function sanitizeFileNamePart(text: string, maxLength: number): string {
  const cleaned = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[/\\:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength).trim()}…` : cleaned;
}

// Les photos brutes vont dans un sous-dossier, pour que le dossier principal ne
// montre que les PDF récapitulatifs (qui contiennent déjà les photos). Elles
// restent indispensables : l'écran admin et la génération du PDF les relisent
// depuis Drive par leur id (voir streamPhotoFromDrive, pdfReport.ts).
export const PHOTOS_SUBFOLDER_NAME = "Photos";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

// Mémorisé pour ne pas relister Drive à chaque photo ; oublié en cas d'échec pour
// retenter à la photo suivante plutôt que de rester bloqué sur une erreur passagère.
let photosSubfolderId: Promise<string> | null = null;

export function getPhotosSubfolderId(): Promise<string> {
  if (!photosSubfolderId) {
    photosSubfolderId = findOrCreatePhotosSubfolder().catch((error) => {
      photosSubfolderId = null;
      throw error;
    });
  }
  return photosSubfolderId;
}

async function findOrCreatePhotosSubfolder(): Promise<string> {
  const parentId = env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID;
  const existing = await drive.files.list({
    q: `name = '${PHOTOS_SUBFOLDER_NAME}' and mimeType = '${FOLDER_MIME_TYPE}' and '${parentId}' in parents and trashed = false`,
    fields: "files(id)",
    pageSize: 1,
  });
  const existingId = existing.data.files?.[0]?.id;
  if (existingId) return existingId;

  const created = await drive.files.create({
    requestBody: { name: PHOTOS_SUBFOLDER_NAME, mimeType: FOLDER_MIME_TYPE, parents: [parentId] },
    fields: "id",
  });
  if (!created.data.id) {
    throw new Error("Google Drive n'a pas renvoyé d'id après la création du sous-dossier Photos.");
  }
  return created.data.id;
}

export async function uploadPhotoToDrive(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<{ fileId: string; webViewLink: string }> {
  const response = await drive.files.create({
    requestBody: { name: fileName, parents: [await getPhotosSubfolderId()] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id, webViewLink",
  });
  if (!response.data.id) {
    throw new Error("Google Drive n'a pas renvoyé d'id de fichier après l'envoi.");
  }
  return { fileId: response.data.id, webViewLink: response.data.webViewLink ?? driveViewLink(response.data.id) };
}

export function driveViewLink(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

// Utilisé par l'écran admin pour afficher la photo (voir photos.routes.ts#/:photoId/view) :
// le fichier n'est jamais public, donc on ne renvoie jamais son URL Drive brute au
// mobile — on relit les octets ici et le serveur les retransmet, protégé par
// l'authentification normale de l'API (voir middleware/auth.ts).
export async function streamPhotoFromDrive(fileId: string): Promise<{ stream: Readable; mimeType: string }> {
  const meta = await drive.files.get({ fileId, fields: "mimeType" });
  const content = await drive.files.get({ fileId, alt: "media" }, { responseType: "stream" });
  return { stream: content.data as unknown as Readable, mimeType: meta.data.mimeType ?? "application/octet-stream" };
}

export async function getPhotoMetadata(fileId: string): Promise<{ exists: boolean; sizeBytes?: number }> {
  try {
    const meta = await drive.files.get({ fileId, fields: "size" });
    return { exists: true, sizeBytes: meta.data.size ? Number(meta.data.size) : undefined };
  } catch (error) {
    const status = (error as { code?: number }).code;
    if (status === 404) return { exists: false };
    throw error;
  }
}

export async function deletePhotoFromDrive(fileId: string): Promise<void> {
  return deleteDriveFile(fileId);
}

// Suppression générique (pas de logique propre aux photos) — utilisée aussi par
// pdfReport.ts pour remplacer un ancien PDF de conclusion médicale quand l'admin
// enregistre une nouvelle version (voir uploadConclusionPdfToDrive).
export async function deleteDriveFile(fileId: string): Promise<void> {
  try {
    await drive.files.delete({ fileId });
  } catch (error) {
    const status = (error as { code?: number }).code;
    if (status !== 404) throw error; // ignoreNotFound, comme deleteObject() dans l'ancien services/storage.ts
  }
}
