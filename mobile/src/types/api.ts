// Contrats alignés sur backend/prisma/schema.prisma. Dupliqués volontairement (pas
// de workspace partagé pour la V1, voir README racine) — toute évolution du schéma
// backend doit être répercutée ici à la main.

export type ConsultationStatus = "draft" | "pending" | "confirmed" | "seen" | "completed" | "cancelled";
export type Sexe = "M" | "F";
export type StatutMatrimonial = "celibataire" | "marie" | "vie_en_couple" | "veuf_veuve" | "autre";
export type DureeUnite = "jours" | "semaines" | "mois" | "annees";
export type Demangeaison = "oui" | "non" | "parfois" | "nuit";
export type EntourageStatus = "oui" | "non" | "ne_sait_pas";
export type PhotoSlot = "vue_generale" | "vue_rapprochee" | "complementaire";
export type PhotoStatus = "pending_upload" | "uploaded" | "failed" | "deleted";

export interface Patient {
  id: string;
  firebaseUid: string;
  nom: string;
  prenom: string;
  telephone: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProfile {
  id: string;
  firebaseUid: string;
  nom: string;
  prenom: string;
  email: string;
  // "agent" = compte terrain (souvent partagé entre plusieurs personnes),
  // accès restreint à la création/correction de ses propres dossiers walk-in —
  // voir requireAdminRole côté backend et navigation/AgentNavigator.tsx.
  role: "admin" | "agent";
  isActive: boolean;
}

export interface Photo {
  id: string;
  consultationId: string;
  slot: PhotoSlot;
  status: PhotoStatus;
  mimeType: string;
  uploadedAt: string | null;
}

export interface Availability {
  id: string;
  jourSemaine: string;
  label: string;
  actif: boolean;
}

export interface ConsultationSummary {
  id: string;
  refNumber: number;
  status: ConsultationStatus;
  nomComplet: string | null;
  motif: string | null;
  submittedAt: string | null;
  createdAt: string;
  unreadMessagesCount: number;
}

export interface ConsultationDraft {
  nomComplet?: string;
  sexe?: Sexe;
  statutMatrimonial?: StatutMatrimonial;
  age?: number;
  /** Format ISO (YYYY-MM-DD) — le backend la reçoit en chaîne et la convertit en Date. */
  dateNaissance?: string;
  ville?: string;
  profession?: string;
  telephoneContact?: string;
  emailContact?: string;
  confirmationWhatsapp?: boolean;
  poidsKg?: number;
  tailleCm?: number;
  temperatureC?: number;

  motif?: string;
  conseilCosmetiqueDemande?: boolean;
  conseilCosmetiquePrecision?: string;

  dureeValeur?: number;
  dureeUnite?: DureeUnite;
  localisationPremieresLesions?: string;

  demangeaison?: Demangeaison;

  /** Zones du corps touchées, sélectionnées sur la carte du corps (codes de zone —
   * voir mobile/src/components/BodyMap.tsx pour la liste). */
  lesionZones?: string[];

  autresLesions?: boolean;
  autresLesionsAspect?: string;
  autresLesionsLocalisation?: string;
  zonesSensiblesAtteintes?: boolean;
  zonesSensiblesPrecision?: string;

  entourageStatus?: EntourageStatus;
  entouragePrecision?: string;

  produitsUtilises?: boolean;
  produitsPrecision?: string;

  antecedentsMedicaux?: boolean;
  antecedentsPrecision?: string;
  notesComplementaires?: string;

  photosQualiteConfirmee?: boolean;

  lesionTypes?: Array<{ code: string; precision?: string }>;
  availabilities?: Array<{ availabilityId?: string; autrePrecision?: string }>;
}

export interface LesionType {
  code: string;
  labelFr: string;
  description: string | null;
}

export interface AdminConsultationListItem {
  id: string;
  refNumber: number;
  status: ConsultationStatus;
  motif: string | null;
  submittedAt: string | null;
  createdAt: string;
  // Identité saisie à l'étape 1 du questionnaire pour CE dossier — à préférer à
  // `patient.*` (le compte connecté) : un agent terrain crée des dossiers pour
  // des tiers sous son propre compte, donc patient.nom/prenom/telephone est
  // souvent le sien, pas celui de la personne consultée.
  nomComplet: string | null;
  telephoneContact: string | null;
  patient: { nom: string; prenom: string; telephone: string };
  unreadMessagesCount: number;
}

export interface StatusHistoryEntry {
  id: string;
  previousStatus: ConsultationStatus | null;
  newStatus: ConsultationStatus;
  changedByType: "patient" | "admin" | "system";
  reason: string | null;
  createdAt: string;
}

export type AdminConsultationDetail = Omit<ConsultationDraft, "lesionTypes" | "availabilities"> & {
  id: string;
  refNumber: number;
  status: ConsultationStatus;
  submittedAt: string | null;
  createdAt: string;
  unreadMessagesCount: number;
  patient: { id: string; nom: string; prenom: string; telephone: string; email: string };
  lesionTypes: Array<{ lesionCode: string; precision: string | null; lesionType: LesionType }>;
  availabilities: Array<{ id: string; autrePrecision: string | null; availability: Availability | null }>;
  photos: Photo[];
  consent: { consentTextVersion: string; consentedAt: string } | null;
  appointment: {
    id: string;
    scheduledAt: string | null;
    notes: string | null;
    availability: Availability | null;
    createdByAdmin: { nom: string; prenom: string };
  } | null;
  statusHistory: StatusHistoryEntry[];
  // Conclusion médicale interne — jamais exposée côté patient (voir
  // consultations.service.ts#omitAdminOnlyFields côté backend). N'apparaît que
  // dans les réponses des routes /admin/* (optionnels ici pour ne pas forcer les
  // objets de démo dev preview, voir services/devPreview/adminMock.ts, à les fournir).
  conclusionMedicale?: string | null;
  conclusionSavedAt?: string | null;
  conclusionDriveFileId?: string | null;
};

// Un seul fil par dossier — voir Message dans backend/prisma/schema.prisma.
// "system" = message automatique posté par le backend à chaque changement de
// statut (confirmé/vu/terminé/annulé), c'est la notification du patient.
export interface Message {
  id: string;
  consultationId: string;
  senderType: "patient" | "admin" | "system";
  body: string;
  createdAt: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
