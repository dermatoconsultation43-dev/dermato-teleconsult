import { useState } from "react";
import { saveDraft } from "../../services/api/consultations";
import { saveWalkInDraft } from "../../services/api/agent";
import { ApiError } from "../../services/api/client";
import { useConsultationDraftStore } from "../../store/consultationDraftStore";
import { useOfflineStore } from "../../store/offlineStore";
import { useIsDevPreview } from "../../hooks/useIsDevPreview";
import { countPendingDrafts, saveDraftLocally } from "../../services/offline/draftQueue";

// Traduit les noms de champs du schéma backend (voir consultations.schemas.ts)
// en libellés lisibles, pour transformer le détail zod (`error.details.fieldErrors`)
// en message exploitable — le message générique du serveur ("Corps de requête
// invalide.") ne dit jamais quel champ poser problème.
const FIELD_LABELS: Record<string, string> = {
  nomComplet: "Nom complet",
  sexe: "Sexe",
  statutMatrimonial: "Statut matrimonial",
  age: "Âge",
  dateNaissance: "Date de naissance",
  ville: "Ville",
  profession: "Profession",
  telephoneContact: "Numéro de téléphone",
  emailContact: "Adresse email",
  confirmationWhatsapp: "Confirmation par WhatsApp",
  poidsKg: "Poids",
  tailleCm: "Taille",
  temperatureC: "Température",
  motif: "Motif de consultation",
  conseilCosmetiqueDemande: "Conseil cosmétique demandé",
  conseilCosmetiquePrecision: "Précision conseil cosmétique",
  dureeValeur: "Durée",
  dureeUnite: "Unité de durée",
  localisationPremieresLesions: "Localisation des premières lésions",
  demangeaison: "Démangeaisons",
  lesionZones: "Zones du corps touchées",
  autresLesions: "Autres lésions",
  autresLesionsAspect: "Aspect des autres lésions",
  autresLesionsLocalisation: "Localisation des autres lésions",
  zonesSensiblesAtteintes: "Zones sensibles atteintes",
  zonesSensiblesPrecision: "Précision zones sensibles",
  entourageStatus: "Cas similaires dans l'entourage",
  entouragePrecision: "Précision entourage",
  produitsUtilises: "Produits utilisés",
  produitsPrecision: "Précision produits",
  antecedentsMedicaux: "Antécédents médicaux",
  antecedentsPrecision: "Précision antécédents",
  notesComplementaires: "Notes complémentaires",
  photosQualiteConfirmee: "Confirmation qualité des photos",
};

function formatValidationDetails(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const fieldErrors = (details as { fieldErrors?: Record<string, string[]> }).fieldErrors;
  if (!fieldErrors) return null;
  const entries = Object.entries(fieldErrors).filter(([, msgs]) => msgs && msgs.length > 0);
  if (entries.length === 0) return null;
  return entries.map(([field, msgs]) => `${FIELD_LABELS[field] ?? field} : ${msgs[0]}`).join("\n");
}

// Appelé au "Continuer" de chaque étape : sauvegarde tout le brouillon (pas
// seulement le champ de l'étape courante). Si le réseau répond (même avec une
// erreur métier), on bloque et on affiche l'erreur — mais si l'appel échoue
// pour cause de connectivité (ApiError status 0, voir services/api/client), on
// n'empêche pas l'utilisateur d'avancer : le snapshot est mis en file locale
// (services/offline/draftQueue) et sera rejoué automatiquement par
// syncEngine dès le retour de la connexion. La bannière globale
// (OfflineBanner) informe l'utilisateur du stockage local — inutile de le
// répéter à chaque étape.
//
// Mode "agent" (voir consultationDraftStore#mode) : même mécanique, mais vise
// /admin/agent-consultations (services/api/agent.ts) — un admin saisit le dossier
// pour un patient sans compte, voir "mode terrain" dans AdminDashboardScreen.
export function useSaveDraftStep() {
  const mode = useConsultationDraftStore((s) => s.mode);
  const clientUuid = useConsultationDraftStore((s) => s.clientUuid);
  const draft = useConsultationDraftStore((s) => s.draft);
  const setConsultationMeta = useConsultationDraftStore((s) => s.setConsultationMeta);
  const setDraftStatus = useOfflineStore((s) => s.setDraftStatus);
  const setPendingCount = useOfflineStore((s) => s.setPendingCount);
  const isDevPreview = useIsDevPreview();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveAndContinue(onSuccess: () => void) {
    // Mode aperçu dev (voir LoginScreen) : aucun compte Firebase réel, donc aucun
    // appel API possible — on avance directement pour permettre de parcourir tout le
    // formulaire hors ligne.
    if (isDevPreview) {
      onSuccess();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = mode === "agent" ? await saveWalkInDraft(clientUuid, draft) : await saveDraft(clientUuid, draft);
      setConsultationMeta(result.id, result.refNumber);
      setDraftStatus(clientUuid, "synced");
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        saveDraftLocally(clientUuid, draft, mode);
        setDraftStatus(clientUuid, "pending");
        setPendingCount(countPendingDrafts());
        onSuccess();
      } else if (err instanceof ApiError) {
        setError(formatValidationDetails(err.details) ?? err.message);
      } else {
        setError("Une erreur est survenue. Réessayez.");
      }
    } finally {
      setSaving(false);
    }
  }

  return { saveAndContinue, saving, error };
}
