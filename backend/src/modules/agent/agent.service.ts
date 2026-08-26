import { prisma } from "../../db/client.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { upsertDraft } from "../consultations/consultations.service.js";
import type { ConsultationDraftInput } from "../consultations/consultations.schemas.js";

// Sépare "prénom" du reste sur le premier espace — heuristique volontairement
// simple : nomComplet est un champ texte libre saisi par l'agent, on n'a aucune
// garantie de structure (voir la question "sa veut dire quoi" côté produit : ce
// champ existe pour reproduire le formulaire papier, pas pour une saisie stricte
// prénom/nom séparés).
function splitFullName(fullName: string): { prenom: string; nom: string } {
  const trimmed = fullName.trim();
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return { prenom: trimmed, nom: "" };
  return { prenom: trimmed.slice(0, spaceIndex), nom: trimmed.slice(spaceIndex + 1).trim() };
}

// Un dossier "terrain" identifie son patient uniquement par ce que l'agent saisit
// dans le formulaire (nomComplet, telephoneContact) — jamais par un compte Firebase,
// qui n'existe pas pour ces patients (voir Patient.firebaseUid nullable).
async function resolveWalkInPatientId(consultationId: string): Promise<string> {
  const consultation = await prisma.consultation.findUnique({
    where: { id: consultationId },
    select: { patientId: true, patient: { select: { firebaseUid: true } } },
  });
  if (!consultation) throw new NotFoundError("Consultation introuvable.");
  if (consultation.patient.firebaseUid !== null) {
    // Rempart de sécurité : un agent ne doit jamais pouvoir agir sur le dossier
    // d'un patient qui a son propre compte, même en devinant/forgeant un id.
    throw new ForbiddenError("Ce dossier appartient à un compte patient existant.");
  }
  return consultation.patientId;
}

export async function createOrUpdateWalkInDraft(adminId: string, clientUuid: string, input: ConsultationDraftInput) {
  const existing = await prisma.consultation.findUnique({
    where: { clientUuid },
    select: { patientId: true, patient: { select: { firebaseUid: true } } },
  });

  let patientId: string;
  if (existing) {
    if (existing.patient.firebaseUid !== null) {
      throw new ForbiddenError("Ce dossier appartient à un compte patient existant.");
    }
    patientId = existing.patientId;
    // Le nom/téléphone peuvent avoir été corrigés par l'agent depuis le premier
    // enregistrement — on garde la fiche Patient à jour avec la dernière saisie.
    if (input.nomComplet || input.telephoneContact) {
      const { prenom, nom } = splitFullName(input.nomComplet ?? "");
      await prisma.patient.update({
        where: { id: patientId },
        data: {
          ...(input.nomComplet ? { nom, prenom } : {}),
          ...(input.telephoneContact ? { telephone: input.telephoneContact } : {}),
          ...(input.emailContact ? { email: input.emailContact } : {}),
        },
      });
    }
  } else {
    if (!input.nomComplet) {
      throw new ValidationError("Le nom complet est requis pour créer un dossier.");
    }
    const { prenom, nom } = splitFullName(input.nomComplet);

    // Le numéro est facultatif sur le terrain (pas toujours disponible/connu) —
    // la déduplication par numéro ne s'applique donc que s'il est renseigné.
    // Ce numéro est peut-être déjà celui d'un patient terrain saisi lors d'une
    // précédente visite (ou d'un téléphone partagé en famille) — on réutilise
    // alors sa fiche plutôt que de percuter la contrainte unique sur
    // patients.telephone. S'il appartient à un compte inscrit (firebaseUid non
    // nul), c'est un vrai conflit : l'agent ne doit jamais créer de dossier à la
    // place d'un patient qui a son propre compte.
    const existingByPhone = input.telephoneContact
      ? await prisma.patient.findFirst({
          where: { telephone: input.telephoneContact, deletedAt: null },
          select: { id: true, firebaseUid: true },
        })
      : null;

    if (existingByPhone) {
      if (existingByPhone.firebaseUid !== null) {
        throw new ConflictError(
          "Ce numéro de téléphone est déjà associé à un compte patient inscrit — demandez à la personne de se connecter elle-même.",
        );
      }
      patientId = existingByPhone.id;
      await prisma.patient.update({
        where: { id: patientId },
        data: { nom, prenom, ...(input.emailContact ? { email: input.emailContact } : {}) },
      });
    } else {
      const patient = await prisma.patient.create({
        data: {
          firebaseUid: null,
          nom,
          prenom,
          telephone: input.telephoneContact ?? null,
          email: input.emailContact ?? null,
          createdByAdminId: adminId,
        },
      });
      patientId = patient.id;
    }
  }

  return upsertDraft(patientId, clientUuid, input);
}

export { resolveWalkInPatientId };
