import { ConsultationStatus } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors.js";

async function assertOwnedConsultation(consultationId: string, patientId: string) {
  const consultation = await prisma.consultation.findUnique({ where: { id: consultationId } });
  if (!consultation) throw new NotFoundError("Consultation introuvable.");
  if (consultation.patientId !== patientId) throw new ForbiddenError();
  // Un brouillon n'a pas encore été soumis, donc pas encore d'équipe admin/dermato
  // assignée avec qui échanger — au-delà (y compris "annulé"), le fil reste ouvert.
  if (consultation.status === ConsultationStatus.draft) {
    throw new ConflictError("La messagerie n'est disponible qu'après l'envoi du dossier.");
  }
  return consultation;
}

// Marque le fil comme lu par le patient au moment même où il le consulte — pas
// d'endpoint "marquer comme lu" séparé, ouvrir l'écran suffit (voir
// unreadMessagesCount dans consultations.service.ts#listConsultations, calculé à
// partir de patientLastReadMessagesAt).
export async function listMessages(patientId: string, consultationId: string) {
  await assertOwnedConsultation(consultationId, patientId);

  const messages = await prisma.message.findMany({
    where: { consultationId },
    orderBy: { createdAt: "asc" },
  });

  await prisma.consultation.update({
    where: { id: consultationId },
    data: { patientLastReadMessagesAt: new Date() },
  });

  return messages;
}

export async function sendMessage(patientId: string, consultationId: string, body: string) {
  await assertOwnedConsultation(consultationId, patientId);

  return prisma.message.create({
    data: { consultationId, senderType: "patient", senderPatientId: patientId, body },
  });
}
