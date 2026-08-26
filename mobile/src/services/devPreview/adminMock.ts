import type { AdminConsultationDetail, AdminConsultationListItem, ConsultationStatus } from "../../types/api";
import type { ChangeStatusInput } from "../api/admin";

// Mode aperçu dev (voir LoginScreen "Aperçu admin sans connexion") : jeu de
// données en mémoire pour parcourir la liste, la fiche détail et les transitions
// de statut de l'espace admin sans aucun appel serveur. Réinitialisé à chaque
// redémarrage de l'app (pas de persistance, volontairement — c'est un aperçu).

const LESION_IMAGES = {
  tache: require("../../assets/lesions/tache.jpg"),
  papule: require("../../assets/lesions/papule.jpg"),
  plaque: require("../../assets/lesions/plaque.jpg"),
  pustule: require("../../assets/lesions/pustule.jpg"),
  vesicule: require("../../assets/lesions/vesicule.jpg"),
  bulle: require("../../assets/lesions/bulle.jpg"),
} as const;

export interface MockConsultation extends AdminConsultationDetail {
  photoSources: Record<string, ReturnType<typeof require>>;
}

const now = new Date().toISOString();

const records: MockConsultation[] = [
  {
    id: "dev-c1",
    refNumber: 100234,
    unreadMessagesCount: 0,
    status: "pending",
    submittedAt: now,
    createdAt: now,
    nomComplet: "Aya Koffi",
    sexe: "F",
    statutMatrimonial: "celibataire",
    age: 27,
    ville: "Abidjan",
    profession: "Commerçante",
    telephoneContact: "+225 07 00 11 22 33",
    emailContact: "aya.koffi@example.com",
    confirmationWhatsapp: true,
    poidsKg: 61,
    tailleCm: 165,
    temperatureC: 37.1,
    motif: "Plaques rouges qui grattent depuis deux semaines, apparues sur l'avant-bras.",
    conseilCosmetiqueDemande: false,
    dureeValeur: 2,
    dureeUnite: "semaines",
    localisationPremieresLesions: "Avant-bras droit",
    demangeaison: "oui",
    autresLesions: false,
    zonesSensiblesAtteintes: false,
    entourageStatus: "non",
    produitsUtilises: false,
    antecedentsMedicaux: false,
    photosQualiteConfirmee: true,
    patient: { id: "dev-p1", nom: "Koffi", prenom: "Aya", telephone: "+225 07 00 11 22 33", email: "aya.koffi@example.com" },
    lesionTypes: [
      { lesionCode: "plaque", precision: null, lesionType: { code: "plaque", labelFr: "Plaques", description: null } },
    ],
    availabilities: [{ id: "a1", autrePrecision: null, availability: { id: "dev-lundi", jourSemaine: "lundi", label: "Lundi 19h30–20h30", actif: true } }],
    photos: [
      { id: "ph1", consultationId: "dev-c1", slot: "vue_generale", status: "uploaded", mimeType: "image/jpeg", uploadedAt: now },
      { id: "ph2", consultationId: "dev-c1", slot: "vue_rapprochee", status: "uploaded", mimeType: "image/jpeg", uploadedAt: now },
    ],
    photoSources: { ph1: LESION_IMAGES.plaque, ph2: LESION_IMAGES.pustule },
    consent: { consentTextVersion: "v1.0-2026-08-17", consentedAt: now },
    appointment: null,
    statusHistory: [{ id: "h1", previousStatus: null, newStatus: "pending", changedByType: "patient", reason: null, createdAt: now }],
  },
  {
    id: "dev-c2",
    refNumber: 100235,
    unreadMessagesCount: 0,
    status: "confirmed",
    submittedAt: now,
    createdAt: now,
    nomComplet: "Yao Brou",
    sexe: "M",
    statutMatrimonial: "marie",
    age: 34,
    ville: "Bouaké",
    profession: "Enseignant",
    telephoneContact: "+225 05 44 55 66 77",
    emailContact: "yao.brou@example.com",
    confirmationWhatsapp: true,
    poidsKg: 78,
    tailleCm: 178,
    temperatureC: 36.8,
    motif: "Petites bulles douloureuses apparues sur l'avant-bras après une brûlure légère.",
    conseilCosmetiqueDemande: false,
    dureeValeur: 4,
    dureeUnite: "jours",
    localisationPremieresLesions: "Avant-bras gauche",
    demangeaison: "parfois",
    autresLesions: false,
    zonesSensiblesAtteintes: false,
    entourageStatus: "non",
    produitsUtilises: true,
    produitsPrecision: "Pommade cicatrisante en vente libre",
    antecedentsMedicaux: false,
    photosQualiteConfirmee: true,
    patient: { id: "dev-p2", nom: "Brou", prenom: "Yao", telephone: "+225 05 44 55 66 77", email: "yao.brou@example.com" },
    lesionTypes: [
      { lesionCode: "vesicule", precision: null, lesionType: { code: "vesicule", labelFr: "Vésicules", description: null } },
      { lesionCode: "bulle", precision: null, lesionType: { code: "bulle", labelFr: "Bulles / cloques", description: null } },
    ],
    availabilities: [{ id: "a2", autrePrecision: null, availability: { id: "dev-samedi-matin", jourSemaine: "samedi", label: "Samedi 09h00–12h00", actif: true } }],
    photos: [
      { id: "ph3", consultationId: "dev-c2", slot: "vue_generale", status: "uploaded", mimeType: "image/jpeg", uploadedAt: now },
      { id: "ph4", consultationId: "dev-c2", slot: "vue_rapprochee", status: "uploaded", mimeType: "image/jpeg", uploadedAt: now },
    ],
    photoSources: { ph3: LESION_IMAGES.vesicule, ph4: LESION_IMAGES.bulle },
    consent: { consentTextVersion: "v1.0-2026-08-17", consentedAt: now },
    appointment: {
      id: "ap1",
      scheduledAt: now,
      notes: "Prévoir de retirer les vêtements manches longues pour l'examen.",
      availability: { id: "dev-samedi-matin", jourSemaine: "samedi", label: "Samedi 09h00–12h00", actif: true },
      createdByAdmin: { nom: "Nguena", prenom: "Ulrich" },
    },
    statusHistory: [
      { id: "h2a", previousStatus: null, newStatus: "pending", changedByType: "patient", reason: null, createdAt: now },
      { id: "h2b", previousStatus: "pending", newStatus: "confirmed", changedByType: "admin", reason: null, createdAt: now },
    ],
  },
  {
    id: "dev-c3",
    refNumber: 100236,
    unreadMessagesCount: 0,
    status: "seen",
    submittedAt: now,
    createdAt: now,
    nomComplet: "Adjoua N'Guessan",
    sexe: "F",
    statutMatrimonial: "vie_en_couple",
    age: 41,
    ville: "Yamoussoukro",
    profession: "Infirmière",
    telephoneContact: "+225 01 22 33 44 55",
    emailContact: "adjoua.nguessan@example.com",
    confirmationWhatsapp: false,
    poidsKg: 68,
    tailleCm: 170,
    temperatureC: 37.0,
    motif: "Bouton douloureux au menton, présent depuis une semaine, ne cicatrise pas.",
    conseilCosmetiqueDemande: true,
    conseilCosmetiquePrecision: "Recherche un nettoyant doux adapté à la peau grasse.",
    dureeValeur: 1,
    dureeUnite: "semaines",
    localisationPremieresLesions: "Menton",
    demangeaison: "non",
    autresLesions: false,
    zonesSensiblesAtteintes: false,
    entourageStatus: "ne_sait_pas",
    produitsUtilises: false,
    antecedentsMedicaux: true,
    antecedentsPrecision: "Diabète de type 2, sous metformine.",
    photosQualiteConfirmee: true,
    patient: { id: "dev-p3", nom: "N'Guessan", prenom: "Adjoua", telephone: "+225 01 22 33 44 55", email: "adjoua.nguessan@example.com" },
    lesionTypes: [
      { lesionCode: "papule", precision: null, lesionType: { code: "papule", labelFr: "Papules", description: null } },
    ],
    availabilities: [{ id: "a3", autrePrecision: null, availability: { id: "dev-mercredi", jourSemaine: "mercredi", label: "Mercredi 19h30–20h30", actif: true } }],
    photos: [
      { id: "ph5", consultationId: "dev-c3", slot: "vue_generale", status: "uploaded", mimeType: "image/jpeg", uploadedAt: now },
      { id: "ph6", consultationId: "dev-c3", slot: "vue_rapprochee", status: "uploaded", mimeType: "image/jpeg", uploadedAt: now },
    ],
    photoSources: { ph5: LESION_IMAGES.tache, ph6: LESION_IMAGES.papule },
    consent: { consentTextVersion: "v1.0-2026-08-17", consentedAt: now },
    appointment: {
      id: "ap2",
      scheduledAt: now,
      notes: null,
      availability: { id: "dev-mercredi", jourSemaine: "mercredi", label: "Mercredi 19h30–20h30", actif: true },
      createdByAdmin: { nom: "Nguena", prenom: "Ulrich" },
    },
    statusHistory: [
      { id: "h3a", previousStatus: null, newStatus: "pending", changedByType: "patient", reason: null, createdAt: now },
      { id: "h3b", previousStatus: "pending", newStatus: "confirmed", changedByType: "admin", reason: null, createdAt: now },
      { id: "h3c", previousStatus: "confirmed", newStatus: "seen", changedByType: "admin", reason: null, createdAt: now },
    ],
  },
];

export function listMockAdminConsultations(status?: ConsultationStatus, search?: string): AdminConsultationListItem[] {
  const q = search?.trim().toLowerCase();
  return records
    .filter((r) => !status || r.status === status)
    .filter(
      (r) =>
        !q ||
        `${r.patient.prenom} ${r.patient.nom}`.toLowerCase().includes(q) ||
        r.patient.telephone.toLowerCase().includes(q),
    )
    .map((r) => ({
      id: r.id,
      refNumber: r.refNumber,
      status: r.status,
      motif: r.motif ?? null,
      submittedAt: r.submittedAt,
      createdAt: r.createdAt,
      nomComplet: r.nomComplet ?? null,
      telephoneContact: r.telephoneContact ?? null,
      patient: { nom: r.patient.nom, prenom: r.patient.prenom, telephone: r.patient.telephone },
      unreadMessagesCount: r.unreadMessagesCount,
    }));
}

export function getMockAdminConsultationDetail(id: string): MockConsultation | undefined {
  return records.find((r) => r.id === id);
}

export function updateMockConsultationStatus(id: string, input: ChangeStatusInput): MockConsultation {
  const record = records.find((r) => r.id === id);
  if (!record) throw new Error("Dossier introuvable.");

  record.statusHistory = [
    ...record.statusHistory,
    {
      id: `h-${record.statusHistory.length + 1}`,
      previousStatus: record.status,
      newStatus: input.newStatus,
      changedByType: "admin",
      reason: input.reason ?? null,
      createdAt: new Date().toISOString(),
    },
  ];
  record.status = input.newStatus;

  if (input.newStatus === "confirmed") {
    const availability = input.availabilityId
      ? record.availabilities.find((a) => a.availability?.id === input.availabilityId)?.availability ?? null
      : null;
    record.appointment = {
      id: record.appointment?.id ?? `ap-${record.id}`,
      scheduledAt: input.scheduledAt ?? record.appointment?.scheduledAt ?? null,
      notes: input.notes ?? record.appointment?.notes ?? null,
      availability,
      createdByAdmin: { nom: "Aperçu", prenom: "Admin" },
    };
  }

  return record;
}
