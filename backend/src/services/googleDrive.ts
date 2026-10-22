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

export function buildPhotoFileName(consultationId: string, photoId: string, mimeType: string): string {
  const extension = ALLOWED_PHOTO_MIME_TYPES[mimeType] ?? "bin";
  return `${consultationId}_${photoId}.${extension}`;
}

export async function uploadPhotoToDrive(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<{ fileId: string; webViewLink: string }> {
  const response = await drive.files.create({
    requestBody: { name: fileName, parents: [env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID] },
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
