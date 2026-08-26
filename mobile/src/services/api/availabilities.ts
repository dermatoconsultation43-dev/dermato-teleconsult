import { apiRequest } from "./client";
import type { Availability, ConsultationDraft } from "../../types/api";

export function listAvailabilities() {
  return apiRequest<{ items: Availability[] }>("/availabilities");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ConsentAvailabilities.tsx retombe sur une liste de créneaux codée en dur quand
// /availabilities n'a pas pu être chargée (hors ligne) — ses identifiants
// ("dev-lundi"...) ne correspondent à aucune vraie ligne Availability et seraient
// rejetés par le backend (availabilityId doit être un UUID, voir
// consultations.schemas.ts). On les convertit ici en texte libre juste avant
// l'envoi, pour que le dossier reste synchronisable une fois la connexion revenue.
export function sanitizeDraftAvailabilities(draft: ConsultationDraft): ConsultationDraft {
  if (!draft.availabilities?.some((a) => a.availabilityId && !UUID_RE.test(a.availabilityId))) {
    return draft;
  }
  const realSelections: NonNullable<ConsultationDraft["availabilities"]> = [];
  const fallbackLabels: string[] = [];
  let existingPrecision: string | undefined;
  for (const selection of draft.availabilities ?? []) {
    if (selection.availabilityId && !UUID_RE.test(selection.availabilityId)) {
      fallbackLabels.push(selection.availabilityId);
    } else if (selection.autrePrecision) {
      existingPrecision = selection.autrePrecision;
    } else {
      realSelections.push(selection);
    }
  }
  const combined = [...fallbackLabels, ...(existingPrecision ? [existingPrecision] : [])].join(", ");
  return { ...draft, availabilities: [...realSelections, { autrePrecision: combined }] };
}
