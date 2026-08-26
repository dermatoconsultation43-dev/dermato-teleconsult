import { z } from "zod";
import { ConsultationStatus, Demangeaison, DureeUnite, EntourageStatus, Sexe, StatutMatrimonial } from "@prisma/client";

const phoneRegex = /^\+?[0-9 ]{8,20}$/;

const lesionTypeSelectionSchema = z.object({
  // Volontairement une chaîne libre, pas un z.nativeEnum : lesion_types est un
  // référentiel éditable en base, pas une énumération figée dans le code. La
  // validité du code est vérifiée contre la table dans consultations.service.ts.
  code: z.string().trim().min(1).max(50),
  precision: z.string().trim().max(500).optional(),
});

const availabilitySelectionSchema = z
  .object({
    availabilityId: z.string().uuid().optional(),
    autrePrecision: z.string().trim().max(500).optional(),
  })
  .refine((data) => Boolean(data.availabilityId) || Boolean(data.autrePrecision), {
    message: 'Indiquez un créneau existant ou une précision pour "Autres plages".',
  });

// Toutes les questions sont optionnelles ici : c'est un brouillon, il peut être
// sauvegardé à n'importe quelle étape. Les champs requis sont vérifiés uniquement
// au moment de la soumission (consultations.service.ts#submitConsultation).
export const consultationDraftSchema = z.object({
  nomComplet: z.string().trim().min(1).max(200).optional(),
  sexe: z.nativeEnum(Sexe).optional(),
  statutMatrimonial: z.nativeEnum(StatutMatrimonial).optional(),
  age: z.number().int().min(0).max(120).optional(),
  dateNaissance: z.coerce.date().optional(),
  ville: z.string().trim().max(150).optional(),
  profession: z.string().trim().max(150).optional(),
  telephoneContact: z.string().trim().regex(phoneRegex, "Numéro de téléphone invalide.").optional(),
  emailContact: z.string().trim().toLowerCase().email().optional(),
  confirmationWhatsapp: z.boolean().optional(),
  poidsKg: z.number().positive().max(400).optional(),
  tailleCm: z.number().positive().max(272).optional(),
  temperatureC: z.number().min(30).max(45).optional(),

  motif: z.string().trim().min(1).max(4000).optional(),
  conseilCosmetiqueDemande: z.boolean().optional(),
  conseilCosmetiquePrecision: z.string().trim().max(2000).optional(),

  dureeValeur: z.number().int().positive().max(999).optional(),
  dureeUnite: z.nativeEnum(DureeUnite).optional(),
  localisationPremieresLesions: z.string().trim().max(1000).optional(),

  demangeaison: z.nativeEnum(Demangeaison).optional(),

  lesionZones: z.array(z.string().trim().min(1).max(60)).max(40).optional(),

  autresLesions: z.boolean().optional(),
  autresLesionsAspect: z.string().trim().max(1000).optional(),
  autresLesionsLocalisation: z.string().trim().max(1000).optional(),
  zonesSensiblesAtteintes: z.boolean().optional(),
  zonesSensiblesPrecision: z.string().trim().max(1000).optional(),

  entourageStatus: z.nativeEnum(EntourageStatus).optional(),
  entouragePrecision: z.string().trim().max(1000).optional(),

  produitsUtilises: z.boolean().optional(),
  produitsPrecision: z.string().trim().max(1000).optional(),

  antecedentsMedicaux: z.boolean().optional(),
  antecedentsPrecision: z.string().trim().max(1000).optional(),
  notesComplementaires: z.string().trim().max(2000).optional(),

  photosQualiteConfirmee: z.boolean().optional(),

  lesionTypes: z.array(lesionTypeSelectionSchema).max(10).optional(),
  availabilities: z.array(availabilitySelectionSchema).max(10).optional(),
});

export type ConsultationDraftInput = z.infer<typeof consultationDraftSchema>;

export const upsertDraftParamsSchema = z.object({ clientUuid: z.string().uuid() });
export const consultationIdParamsSchema = z.object({ id: z.string().uuid() });

export const listConsultationsQuerySchema = z.object({
  status: z.nativeEnum(ConsultationStatus).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const consentSchema = z.object({
  consentTextVersion: z.string().trim().min(1).max(50),
});
