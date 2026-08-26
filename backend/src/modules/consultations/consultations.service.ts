import { ConsultationStatus } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { notifyConsultationSubmitted } from "../../services/notifications.js";
import { appendConsultationRow } from "../../services/googleSheets.js";
import { buildReportFileName, generateConsultationReportPdf, uploadReportPdfToDrive } from "../../services/pdfReport.js";
import { logger } from "../../lib/logger.js";
import type { ConsultationDraftInput } from "./consultations.schemas.js";

const consultationInclude = {
  lesionTypes: { include: { lesionType: true } },
  availabilities: { include: { availability: true } },
  photos: { where: { deletedAt: null } },
  consent: true,
  appointment: true,
} as const;

async function assertOwnedDraft(consultationId: string, patientId: string) {
  const consultation = await prisma.consultation.findUnique({ where: { id: consultationId } });
  if (!consultation) throw new NotFoundError("Consultation introuvable.");
  if (consultation.patientId !== patientId) throw new ForbiddenError();
  return consultation;
}

// Sauvegarde intégrale du brouillon à chaque appel : le mobile envoie l'état complet
// du formulaire (pas un diff), ce qui correspond à la façon dont la synchro offline
// fonctionne (rejouer le dernier snapshot local). clientUuid est la clé d'idempotence :
// rejouer le même appel après une coupure réseau met à jour la même ligne, jamais
// n'en crée une seconde.
export async function upsertDraft(patientId: string, clientUuid: string, input: ConsultationDraftInput) {
  const existing = await prisma.consultation.findUnique({ where: { clientUuid } });
  if (existing && existing.patientId !== patientId) {
    throw new ForbiddenError();
  }
  if (existing && existing.status !== ConsultationStatus.draft) {
    throw new ConflictError("Cette consultation a déjà été soumise et ne peut plus être modifiée ainsi.");
  }

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

  const availabilityIds = availabilities?.map((a) => a.availabilityId).filter((id): id is string => Boolean(id));
  if (availabilityIds?.length) {
    const validAvailabilities = await prisma.availability.findMany({
      where: { id: { in: availabilityIds }, actif: true },
      select: { id: true },
    });
    if (validAvailabilities.length !== new Set(availabilityIds).size) {
      throw new ValidationError("Une ou plusieurs disponibilités sélectionnées sont invalides ou inactives.");
    }
  }

  const consultation = await prisma.$transaction(async (tx) => {
    const saved = await tx.consultation.upsert({
      where: { clientUuid },
      create: { clientUuid, patientId, ...scalarFields },
      update: scalarFields,
    });

    if (lesionTypes) {
      await tx.consultationLesionType.deleteMany({ where: { consultationId: saved.id } });
      if (lesionTypes.length > 0) {
        await tx.consultationLesionType.createMany({
          data: lesionTypes.map((l) => ({ consultationId: saved.id, lesionCode: l.code, precision: l.precision })),
        });
      }
    }

    if (availabilities) {
      await tx.consultationAvailability.deleteMany({ where: { consultationId: saved.id } });
      if (availabilities.length > 0) {
        await tx.consultationAvailability.createMany({
          data: availabilities.map((a) => ({
            consultationId: saved.id,
            availabilityId: a.availabilityId,
            autrePrecision: a.autrePrecision,
          })),
        });
      }
    }

    return tx.consultation.findUniqueOrThrow({ where: { id: saved.id }, include: consultationInclude });
  });

  return consultation;
}

export async function getConsultation(patientId: string, id: string) {
  const consultation = await prisma.consultation.findUnique({ where: { id }, include: consultationInclude });
  if (!consultation || consultation.deletedAt) throw new NotFoundError("Consultation introuvable.");
  if (consultation.patientId !== patientId) throw new ForbiddenError();
  return consultation;
}

export async function listConsultations(
  patientId: string,
  options: { status?: ConsultationStatus; cursor?: string; limit: number },
) {
  const items = await prisma.consultation.findMany({
    where: { patientId, status: options.status, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: options.limit,
    ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
  });

  // Une requête `count` par dossier plutôt qu'un `_count` Prisma imbriqué :
  // celui-ci ne peut pas filtrer sur `createdAt > patientLastReadMessagesAt`
  // (valeur qui varie par ligne) en une seule requête — acceptable ici vu le
  // faible nombre de dossiers par patient (voir admin.service.ts pour la même
  // logique côté admin, avec le même arbitrage).
  const unreadCounts = await Promise.all(
    items.map((item) =>
      prisma.message.count({
        where: {
          consultationId: item.id,
          senderType: { not: "patient" },
          createdAt: { gt: item.patientLastReadMessagesAt ?? new Date(0) },
        },
      }),
    ),
  );

  return items.map((item, i) => ({ ...item, unreadMessagesCount: unreadCounts[i] }));
}

// Le consentement ne peut être enregistré tant que le dossier n'est pas déjà un
// brouillon accessible au patient, et jamais après soumission (le texte pourrait
// changer de version entre-temps — un nouveau consentement doit accompagner toute
// nouvelle transmission de photos).
export async function recordConsent(
  patientId: string,
  consultationId: string,
  consentTextVersion: string,
  ipAddress: string | undefined,
) {
  const consultation = await assertOwnedDraft(consultationId, patientId);
  if (consultation.status !== ConsultationStatus.draft) {
    throw new ConflictError("Le consentement ne peut être modifié qu'avant l'envoi de la consultation.");
  }

  return prisma.consent.upsert({
    where: { consultationId },
    create: { consultationId, consentTextVersion, consentedAt: new Date(), ipAddress },
    update: { consentTextVersion, consentedAt: new Date(), ipAddress },
  });
}

const REQUIRED_DRAFT_FIELDS: Array<{ field: keyof ConsultationDraftInput; label: string }> = [
  { field: "nomComplet", label: "Nom complet" },
  { field: "sexe", label: "Sexe" },
  { field: "age", label: "Âge" },
  { field: "telephoneContact", label: "Numéro de téléphone" },
  { field: "confirmationWhatsapp", label: "Confirmation par WhatsApp" },
  { field: "motif", label: "Motif de consultation" },
  { field: "demangeaison", label: "Démangeaisons" },
];

// Transition draft -> pending. Tout ce qui est requis pour qu'un dermatologue
// puisse traiter le dossier est vérifié ici, côté serveur — jamais seulement côté
// app mobile, qui ne fait que guider l'utilisateur en amont.
export async function submitConsultation(patientId: string, id: string) {
  const consultation = await prisma.consultation.findUnique({
    where: { id },
    include: consultationInclude,
  });
  if (!consultation) throw new NotFoundError("Consultation introuvable.");
  if (consultation.patientId !== patientId) throw new ForbiddenError();
  if (consultation.status !== ConsultationStatus.draft) {
    throw new ConflictError("Cette consultation a déjà été soumise.");
  }

  const missing = REQUIRED_DRAFT_FIELDS.filter(({ field }) => {
    const value = consultation[field as keyof typeof consultation];
    return value === null || value === undefined || value === "";
  });
  if (missing.length > 0) {
    throw new ValidationError(
      `Champs requis manquants avant l'envoi : ${missing.map((m) => m.label).join(", ")}`,
    );
  }

  // Un problème de peau peut n'avoir aucune lésion visible à photographier — les
  // photos ne sont donc plus obligatoires pour soumettre le dossier. S'il y en a
  // au moins une, la confirmation de qualité reste requise (elle porte sur les
  // photos réellement fournies, pas sur leur absence).
  const hasAnyPhoto = consultation.photos.some((p) => p.status === "uploaded");
  if (hasAnyPhoto && consultation.photosQualiteConfirmee === null) {
    throw new ValidationError("Champs requis manquants avant l'envoi : Confirmation de la qualité des photos");
  }

  if (!consultation.consent) {
    throw new ValidationError("Le consentement à la transmission des photos est requis.");
  }

  if (consultation.availabilities.length === 0) {
    throw new ValidationError("Sélectionnez au moins une disponibilité.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.consultation.update({
      where: { id },
      data: { status: ConsultationStatus.pending, submittedAt: new Date() },
      include: consultationInclude,
    });
    await tx.statusHistory.create({
      data: {
        consultationId: id,
        previousStatus: ConsultationStatus.draft,
        newStatus: ConsultationStatus.pending,
        changedByType: "patient",
        changedByPatientId: patientId,
      },
    });
    return result;
  });

  // Hors transaction, volontairement : un appel réseau externe (Africa's Talking, Google
  // Sheets) ne doit jamais faire échouer ou retarder un commit déjà acquis, et ni
  // sendSms() ni appendConsultationRow() n'échouent bruyamment (voir services/sms.ts et
  // services/googleSheets.ts) — au pire, pas de SMS ou pas de ligne ajoutée au Sheet,
  // jamais de 500 sur une soumission par ailleurs réussie.
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { prenom: true, nom: true, telephone: true, email: true },
  });
  if (patient) {
    if (patient.telephone) {
      await notifyConsultationSubmitted(patient.telephone, updated.refNumber);
    }
    await appendConsultationRow({
      id: updated.id,
      nom: updated.nomComplet ?? `${patient.prenom} ${patient.nom}`.trim(),
      sexe: updated.sexe,
      age: updated.age,
      ville: updated.ville,
      profession: updated.profession,
      telephone: updated.telephoneContact ?? patient.telephone,
      email: updated.emailContact ?? patient.email,
      plaintes: updated.motif,
      demangeaisons: updated.demangeaison,
      aspectLesions: updated.lesionTypes.map((l) => l.lesionCode).join(", "),
      produitsUtilises: updated.produitsPrecision ?? (updated.produitsUtilises ? "Oui" : "Non"),
      maladieChronique: updated.antecedentsPrecision ?? (updated.antecedentsMedicaux ? "Oui" : "Non"),
      photoUrls: updated.photos.map((p) => p.driveFileId),
      plageHoraire: updated.availabilities.map((a) => a.availability?.label ?? a.autrePrecision ?? "").join(", "),
      statutConfirmation: updated.status,
      dateSoumission: updated.submittedAt?.toISOString() ?? null,
    });
  }

  // Rapport PDF combinant tout le questionnaire + les photos, déposé dans le
  // même dossier Drive que les photos brutes (voir services/pdfReport.ts) —
  // hors transaction et non bloquant comme le SMS/Sheets ci-dessus : un échec
  // de génération ou d'upload ne doit jamais faire échouer une soumission par
  // ailleurs réussie, juste laisser le dossier sans PDF récapitulatif.
  try {
    const pdfBuffer = await generateConsultationReportPdf(
      updated,
      patient ? { telephone: patient.telephone, email: patient.email } : null,
    );
    await uploadReportPdfToDrive(pdfBuffer, buildReportFileName(updated));
  } catch (error) {
    logger.error({ err: error, consultationId: id }, "Échec de la génération/envoi du rapport PDF");
  }

  return updated;
}
