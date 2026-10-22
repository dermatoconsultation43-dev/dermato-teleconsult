import { ConsultationStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { streamPhotoFromDrive } from "../../services/googleDrive.js";
import { updateConsultationStatusInSheet } from "../../services/googleSheets.js";
import { buildConclusionFileName, generateConclusionPdf, uploadConclusionPdfToDrive } from "../../services/pdfReport.js";
import type { ConsultationDraftInput } from "../consultations/consultations.schemas.js";

const detailInclude = {
  patient: { select: { id: true, nom: true, prenom: true, telephone: true, email: true } },
  lesionTypes: { include: { lesionType: true } },
  availabilities: { include: { availability: true } },
  photos: { where: { deletedAt: null } },
  consent: true,
  appointment: { include: { availability: true, createdByAdmin: { select: { nom: true, prenom: true } } } },
  statusHistory: { orderBy: { createdAt: "desc" as const } },
} as const;

export async function listAdminConsultations(options: {
  status?: ConsultationStatus;
  search?: string;
  cursor?: string;
  limit: number;
}) {
  const items = await prisma.consultation.findMany({
    where: {
      deletedAt: null,
      status: options.status,
      // Cherche à la fois sur l'identité du dossier (nomComplet, saisie à
      // l'étape 1 — la personne réellement consultée) et sur le compte
      // connecté (patient.*) : un agent terrain crée des dossiers pour des
      // tiers sous son propre compte, donc le nom du patient recherché ne
      // correspond souvent pas au compte associé (voir AdminConsultationsListScreen).
      ...(options.search
        ? {
            OR: [
              { nomComplet: { contains: options.search, mode: "insensitive" } },
              {
                patient: {
                  OR: [
                    { nom: { contains: options.search, mode: "insensitive" } },
                    { prenom: { contains: options.search, mode: "insensitive" } },
                    { telephone: { contains: options.search } },
                  ],
                },
              },
            ],
          }
        : {}),
    },
    include: { patient: { select: { nom: true, prenom: true, telephone: true } } },
    orderBy: { submittedAt: "desc" },
    take: options.limit,
    ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
  });

  return attachAdminUnreadCounts(items);
}

// Nombre de messages patient reçus depuis la dernière lecture admin, par dossier
// (voir Message dans schema.prisma). Une requête `count` par dossier plutôt
// qu'un `_count` Prisma imbriqué : ce dernier ne peut pas filtrer sur
// `createdAt > adminLastReadMessagesAt` (valeur qui varie par ligne) en une
// seule requête — acceptable ici vu le faible nombre de dossiers par page (max
// 100, voir listAdminConsultationsQuerySchema).
async function attachAdminUnreadCounts<T extends { id: string; adminLastReadMessagesAt: Date | null }>(
  items: T[],
): Promise<(T & { unreadMessagesCount: number })[]> {
  const counts = await Promise.all(
    items.map((item) =>
      prisma.message.count({
        where: {
          consultationId: item.id,
          senderType: "patient",
          createdAt: { gt: item.adminLastReadMessagesAt ?? new Date(0) },
        },
      }),
    ),
  );
  return items.map((item, i) => ({ ...item, unreadMessagesCount: counts[i] }));
}

// Compteurs pour l'accueil admin (participants inscrits, dossiers en attente/
// traités, consultations du jour) — des `count()` dédiés plutôt qu'un calcul côté
// mobile sur listAdminConsultations, dont la pagination (max 100) fausserait les
// totaux dès que la clinique dépasse une page de dossiers.
export async function getAdminStats() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [participants, pending, completed, today] = await Promise.all([
    prisma.patient.count(),
    prisma.consultation.count({ where: { status: "pending", deletedAt: null } }),
    prisma.consultation.count({ where: { status: "completed", deletedAt: null } }),
    prisma.consultation.count({ where: { createdAt: { gte: startOfToday }, deletedAt: null } }),
  ]);

  return { participants, pending, completed, today };
}

export async function getAdminConsultationDetail(id: string) {
  const consultation = await prisma.consultation.findUnique({ where: { id }, include: detailInclude });
  if (!consultation || consultation.deletedAt) throw new NotFoundError("Consultation introuvable.");
  const [withCount] = await attachAdminUnreadCounts([consultation]);
  return withCount;
}

// Correction d'un dossier déjà soumis (ex. faute de frappe repérée parmi 200
// dossiers saisis sur le terrain) — volontairement possible quel que soit le
// statut, contrairement à upsertDraft (patient) qui refuse toute modification
// après soumission. Ne touche jamais au statut ni à l'historique : c'est une
// correction de contenu, pas une transition métier (voir changeConsultationStatus
// pour ça).
export async function updateConsultationFields(consultationId: string, input: ConsultationDraftInput) {
  const existing = await prisma.consultation.findUnique({ where: { id: consultationId } });
  if (!existing) throw new NotFoundError("Consultation introuvable.");

  const { lesionTypes, availabilities, ...scalarFields } = input;

  if (lesionTypes?.length) {
    const validCodes = await prisma.lesionType.findMany({
      where: { code: { in: lesionTypes.map((l) => l.code) } },
      select: { code: true },
    });
    const validCodeSet = new Set(validCodes.map((c) => c.code));
    const unknown = lesionTypes.filter((l) => !validCodeSet.has(l.code));
    if (unknown.length > 0) {
      throw new ValidationError(`Type(s) de lésion inconnu(s) : ${unknown.map((l) => l.code).join(", ")}`);
    }
  }

  return prisma.$transaction(async (tx) => {
    await tx.consultation.update({ where: { id: consultationId }, data: scalarFields });

    if (lesionTypes) {
      await tx.consultationLesionType.deleteMany({ where: { consultationId } });
      if (lesionTypes.length > 0) {
        await tx.consultationLesionType.createMany({
          data: lesionTypes.map((l) => ({ consultationId, lesionCode: l.code, precision: l.precision })),
        });
      }
    }

    if (availabilities) {
      await tx.consultationAvailability.deleteMany({ where: { consultationId } });
      if (availabilities.length > 0) {
        await tx.consultationAvailability.createMany({
          data: availabilities.map((a) => ({
            consultationId,
            availabilityId: a.availabilityId,
            autrePrecision: a.autrePrecision,
          })),
        });
      }
    }

    // Si le nom/téléphone/email du dossier a été corrigé, on répercute sur la
    // fiche Patient — sinon la liste admin (qui lit patient.nom/prenom/telephone)
    // resterait incohérente avec le dossier qu'on vient de corriger.
    if (scalarFields.nomComplet || scalarFields.telephoneContact || scalarFields.emailContact) {
      const consultation = await tx.consultation.findUniqueOrThrow({ where: { id: consultationId } });
      const patch: { nom?: string; prenom?: string; telephone?: string; email?: string } = {};
      if (scalarFields.nomComplet) {
        const trimmed = scalarFields.nomComplet.trim();
        const spaceIndex = trimmed.indexOf(" ");
        patch.prenom = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
        patch.nom = spaceIndex === -1 ? "" : trimmed.slice(spaceIndex + 1).trim();
      }
      if (scalarFields.telephoneContact) patch.telephone = scalarFields.telephoneContact;
      if (scalarFields.emailContact) patch.email = scalarFields.emailContact;
      await tx.patient.update({ where: { id: consultation.patientId }, data: patch });
    }

    return tx.consultation.findUniqueOrThrow({ where: { id: consultationId }, include: detailInclude });
  });
}

export async function getAdminPhotoStream(consultationId: string, photoId: string) {
  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo || photo.consultationId !== consultationId || photo.deletedAt || photo.status !== "uploaded") {
    throw new NotFoundError("Photo introuvable.");
  }
  return streamPhotoFromDrive(photo.driveFileId);
}

// Pas de restriction de statut côté admin (contrairement à messages.service.ts
// côté patient, qui bloque tant que le dossier est en brouillon) : un dossier
// admin existe forcément déjà, donc le fil est toujours consultable.
export async function listAdminMessages(consultationId: string) {
  const consultation = await prisma.consultation.findUnique({ where: { id: consultationId } });
  if (!consultation) throw new NotFoundError("Consultation introuvable.");

  const messages = await prisma.message.findMany({
    where: { consultationId },
    orderBy: { createdAt: "asc" },
  });

  await prisma.consultation.update({
    where: { id: consultationId },
    data: { adminLastReadMessagesAt: new Date() },
  });

  return messages;
}

export async function sendAdminMessage(adminId: string, consultationId: string, body: string) {
  const consultation = await prisma.consultation.findUnique({ where: { id: consultationId } });
  if (!consultation) throw new NotFoundError("Consultation introuvable.");

  return prisma.message.create({
    data: { consultationId, senderType: "admin", senderAdminId: adminId, body },
  });
}

// Machine à états explicite : toute transition non listée est refusée. Ça empêche
// par exemple de faire passer un dossier "terminé" directement à "confirmée", ou de
// réutiliser une route de statut pour contourner le flux métier.
export const ALLOWED_TRANSITIONS: Record<ConsultationStatus, ConsultationStatus[]> = {
  draft: [],
  pending: [ConsultationStatus.confirmed, ConsultationStatus.cancelled],
  confirmed: [ConsultationStatus.seen, ConsultationStatus.cancelled],
  seen: [ConsultationStatus.completed, ConsultationStatus.cancelled],
  completed: [],
  cancelled: [],
};

// Le libellé posté comme message "system" est la seule notification que le
// patient reçoit d'un changement de statut (pas de push, voir ADMIN_FIXES.md) —
// donc toujours inclure de quoi agir (créneau, motif) plutôt qu'une simple
// mention du nouveau statut.
function buildStatusChangeMessage(
  newStatus: ConsultationStatus,
  updated: Prisma.ConsultationGetPayload<{ include: typeof detailInclude }>,
  reason: string | undefined,
): string | null {
  switch (newStatus) {
    case ConsultationStatus.confirmed: {
      const when = updated.appointment?.scheduledAt
        ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(updated.appointment.scheduledAt)
        : updated.appointment?.availability?.label;
      return `Votre rendez-vous a été confirmé${when ? ` : ${when}` : ""}.`;
    }
    case ConsultationStatus.seen:
      return "Votre dossier a été consulté par le dermatologue.";
    case ConsultationStatus.completed:
      return "Votre téléconsultation est terminée. Merci de votre confiance.";
    case ConsultationStatus.cancelled:
      return `Votre rendez-vous a été annulé.${reason ? ` Motif : ${reason}` : ""}`;
    default:
      return null;
  }
}

export async function changeConsultationStatus(
  adminId: string,
  consultationId: string,
  input: { newStatus: ConsultationStatus; reason?: string; availabilityId?: string; scheduledAt?: Date; notes?: string },
) {
  const consultation = await prisma.consultation.findUnique({ where: { id: consultationId } });
  if (!consultation) throw new NotFoundError("Consultation introuvable.");

  const allowed = ALLOWED_TRANSITIONS[consultation.status];
  if (!allowed.includes(input.newStatus)) {
    throw new ConflictError(
      `Transition "${consultation.status}" -> "${input.newStatus}" non autorisée.`,
    );
  }

  if (input.newStatus === ConsultationStatus.confirmed && !input.availabilityId && !input.scheduledAt) {
    throw new ValidationError("Indiquez un créneau (availabilityId ou scheduledAt) pour confirmer la consultation.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.consultation.update({
      where: { id: consultationId },
      data: { status: input.newStatus },
    });

    await tx.statusHistory.create({
      data: {
        consultationId,
        previousStatus: consultation.status,
        newStatus: input.newStatus,
        changedByType: "admin",
        changedByAdminId: adminId,
        reason: input.reason,
      },
    });

    if (input.newStatus === ConsultationStatus.confirmed) {
      await tx.appointment.upsert({
        where: { consultationId },
        create: {
          consultationId,
          availabilityId: input.availabilityId,
          scheduledAt: input.scheduledAt,
          notes: input.notes,
          createdByAdminId: adminId,
        },
        update: {
          availabilityId: input.availabilityId,
          scheduledAt: input.scheduledAt,
          notes: input.notes,
          createdByAdminId: adminId,
        },
      });
    }

    // Relu après toutes les mutations (statut + rendez-vous) : renvoyer l'objet
    // capturé avant l'upsert de l'appointment ferait apparaître "appointment: null"
    // dans la réponse juste après une confirmation, alors que la ligne existe déjà
    // en base — c'est exactement le genre d'incohérence qu'un test bout en bout
    // attrape et qu'un test unitaire mocké aurait laissé passer.
    return tx.consultation.findUniqueOrThrow({ where: { id: consultationId }, include: detailInclude });
  });

  // Hors transaction, volontairement (voir notifyConsultationSubmitted dans
  // consultations.service.ts pour la même logique) : un aléa Google Sheets ne
  // doit jamais faire échouer un changement de statut déjà acquis en base.
  await updateConsultationStatusInSheet(consultationId, input.newStatus);

  // Même principe : le message "system" annonçant le changement (seule
  // notification du patient, voir buildStatusChangeMessage) ne doit jamais faire
  // échouer une transition déjà acquise en base si son insertion rate.
  const systemMessageBody = buildStatusChangeMessage(input.newStatus, updated, input.reason);
  if (systemMessageBody) {
    try {
      await prisma.message.create({
        data: { consultationId, senderType: "system", body: systemMessageBody },
      });
    } catch (error) {
      logger.error({ error }, "Échec de la création du message système de changement de statut.");
    }
  }

  const [withCount] = await attachAdminUnreadCounts([updated]);
  return withCount;
}

// Suppression logicielle d'un dossier : marque deletedAt pour archivage
// (sans vraiment effacer les données). Seul un dossier confirmé, vu ou complété
// peut être supprimé (pas un brouillon ou un dossier en attente).
export async function deleteConsultation(consultationId: string, reason: string, adminId: string) {
  const consultation = await prisma.consultation.findUnique({ where: { id: consultationId } });
  if (!consultation) throw new NotFoundError("Consultation introuvable.");

  // Empêcher la suppression d'un dossier en brouillon ou en attente
  if (consultation.status === ConsultationStatus.draft || consultation.status === ConsultationStatus.pending) {
    throw new ConflictError(
      `Impossible de supprimer un dossier au statut "${consultation.status}". ` +
      `Changez d'abord le statut à confirmée, vue ou terminée.`,
    );
  }

  return prisma.$transaction(async (tx) => {
    // Marquer le dossier comme supprimé
    await tx.consultation.update({
      where: { id: consultationId },
      data: { deletedAt: new Date() },
    });

    // Créer une entrée dans l'historique de statut
    await tx.statusHistory.create({
      data: {
        consultationId,
        previousStatus: consultation.status,
        newStatus: consultation.status, // Statut inchangé, mais marqué comme supprimé
        changedByType: "admin",
        changedByAdminId: adminId,
        reason: `Suppression : ${reason}`,
      },
    });

    return tx.consultation.findUniqueOrThrow({ where: { id: consultationId }, include: detailInclude });
  });
}

// Modification d'un rendez-vous confirmé : change le créneau ou la date/heure
// manuelle, ou ajoute/modifie les notes. N'est possible que si le dossier est
// au statut "confirmé".
export async function updateAppointment(
  consultationId: string,
  input: { availabilityId?: string; scheduledAt?: Date; notes?: string },
  adminId: string,
) {
  const consultation = await prisma.consultation.findUnique({ where: { id: consultationId } });
  if (!consultation) throw new NotFoundError("Consultation introuvable.");

  if (consultation.status !== ConsultationStatus.confirmed) {
    throw new ConflictError(
      `Impossible de modifier le rendez-vous d'un dossier au statut "${consultation.status}". ` +
      `Seuls les dossiers confirmés peuvent être modifiés.`,
    );
  }

  if (!input.availabilityId && !input.scheduledAt && input.notes === undefined) {
    throw new ValidationError("Indiquez un créneau (availabilityId ou scheduledAt) ou des notes pour modifier le rendez-vous.");
  }

  return prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.findUnique({ where: { consultationId } });
    if (!appointment) {
      throw new NotFoundError("Rendez-vous introuvable pour cette consultation.");
    }

    // Un rendez-vous est soit sur un créneau prédéfini, soit sur une date manuelle,
    // jamais les deux : en basculer un remplace l'autre plutôt que de le laisser
    // traîner (ex. capacité de créneau qui compterait à tort une place comme prise).
    return tx.appointment.update({
      where: { consultationId },
      data: {
        ...(input.availabilityId ? { availabilityId: input.availabilityId, scheduledAt: null } : {}),
        ...(input.scheduledAt ? { scheduledAt: input.scheduledAt, availabilityId: null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        createdByAdminId: adminId,
      },
      include: { availability: true, createdByAdmin: { select: { nom: true, prenom: true } } },
    });
  });
}

// Conclusion médicale rédigée par l'admin après examen du dossier — champ
// strictement interne (jamais exposé côté patient, voir schema.prisma). Le texte
// est persisté avant l'envoi vers Drive : si l'upload échoue, la conclusion n'est
// jamais perdue et l'admin peut réessayer sans tout retaper. L'ancien PDF (s'il y
// en a un) est remplacé plutôt que dupliqué, voir uploadConclusionPdfToDrive.
export async function saveConsultationConclusion(consultationId: string, conclusion: string, adminId: string) {
  const consultation = await prisma.consultation.findUnique({ where: { id: consultationId } });
  if (!consultation || consultation.deletedAt) throw new NotFoundError("Consultation introuvable.");

  if (consultation.status === ConsultationStatus.draft || consultation.status === ConsultationStatus.pending) {
    throw new ConflictError(
      `Impossible d'enregistrer une conclusion pour un dossier au statut "${consultation.status}". ` +
      `Le dossier doit d'abord être confirmé.`,
    );
  }

  await prisma.consultation.update({ where: { id: consultationId }, data: { conclusionMedicale: conclusion } });

  const admin = await prisma.adminUser.findUniqueOrThrow({ where: { id: adminId }, select: { nom: true, prenom: true } });
  const adminName = `${admin.prenom} ${admin.nom}`.trim();

  const pdfBuffer = await generateConclusionPdf(consultation, conclusion, adminName);
  const { fileId } = await uploadConclusionPdfToDrive(
    pdfBuffer,
    buildConclusionFileName(consultation),
    consultation.conclusionDriveFileId,
  );

  return prisma.consultation.update({
    where: { id: consultationId },
    data: { conclusionDriveFileId: fileId, conclusionSavedAt: new Date(), conclusionSavedByAdminId: adminId },
    include: detailInclude,
  });
}
