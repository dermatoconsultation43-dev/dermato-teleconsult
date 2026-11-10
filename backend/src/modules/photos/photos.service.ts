import { randomUUID } from "node:crypto";
import { ConsultationStatus, type PhotoSlot } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors.js";
import { buildPhotoFileName, deletePhotoFromDrive, streamPhotoFromDrive, uploadPhotoToDrive } from "../../services/googleDrive.js";

async function assertOwnedDraftConsultation(consultationId: string, patientId: string) {
  const consultation = await prisma.consultation.findUnique({ where: { id: consultationId } });
  if (!consultation) throw new NotFoundError("Consultation introuvable.");
  if (consultation.patientId !== patientId) throw new ForbiddenError();
  return consultation;
}

async function getOwnedPhoto(consultationId: string, photoId: string, patientId: string) {
  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo || photo.consultationId !== consultationId || photo.deletedAt) {
    throw new NotFoundError("Photo introuvable.");
  }
  await assertOwnedDraftConsultation(consultationId, patientId);
  return photo;
}

// Upload en une seule étape (contrairement à l'ancien flux GCS request+confirm) :
// les octets transitent par ce serveur (voir middleware/upload.ts) et sont
// retransmis à Drive de façon synchrone. Soit tout réussit et la photo existe
// bien côté Drive avant même que la ligne Photo ne soit créée, soit ça lève et
// rien n'est enregistré — plus besoin d'un statut "pending_upload" à confirmer
// séparément.
export async function uploadPhoto(
  patientId: string,
  consultationId: string,
  input: { slot: PhotoSlot; mimeType: string; sizeBytes: number; buffer: Buffer },
) {
  const consultation = await assertOwnedDraftConsultation(consultationId, patientId);
  if (consultation.status !== ConsultationStatus.draft) {
    throw new ConflictError("Impossible d'ajouter une photo à une consultation déjà soumise.");
  }

  const photoId = randomUUID();
  // Compte aussi les photos supprimées : un numéro n'est jamais réutilisé, donc
  // deux fichiers d'un même dossier ne portent jamais le même nom dans Drive.
  const photoNumber = (await prisma.photo.count({ where: { consultationId } })) + 1;
  const fileName = buildPhotoFileName(consultation, photoNumber, input.mimeType);
  const { fileId } = await uploadPhotoToDrive(input.buffer, fileName, input.mimeType);

  return prisma.photo.create({
    data: {
      id: photoId,
      consultationId,
      slot: input.slot,
      driveFileId: fileId,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      status: "uploaded",
      uploadedAt: new Date(),
    },
  });
}

export async function deletePhoto(patientId: string, consultationId: string, photoId: string) {
  const photo = await getOwnedPhoto(consultationId, photoId, patientId);
  const consultation = await assertOwnedDraftConsultation(consultationId, patientId);
  if (consultation.status !== ConsultationStatus.draft) {
    throw new ConflictError("Impossible de supprimer une photo d'une consultation déjà soumise.");
  }

  await prisma.photo.update({ where: { id: photoId }, data: { status: "deleted", deletedAt: new Date() } });
  await deletePhotoFromDrive(photo.driveFileId);
}

// Remplace getPhotoViewUrl (qui renvoyait une URL signée GCS) : un fichier Drive
// n'est jamais public, donc on relit ses octets ici et la route les retransmet
// directement (voir photos.routes.ts), protégée par l'authentification normale.
export async function getPhotoStream(patientId: string, consultationId: string, photoId: string) {
  const photo = await getOwnedPhoto(consultationId, photoId, patientId);
  if (photo.status !== "uploaded") {
    throw new ConflictError("Cette photo n'est pas encore disponible.");
  }
  return streamPhotoFromDrive(photo.driveFileId);
}
