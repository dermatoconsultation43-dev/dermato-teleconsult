import { apiRequest } from "./client";
import { sanitizeDraftAvailabilities } from "./availabilities";
import type { ConsultationDraft, ConsultationStatus, ConsultationSummary } from "../../types/api";

export function listMyConsultations(status?: ConsultationStatus) {
  const query = status ? `?status=${status}` : "";
  return apiRequest<{ items: ConsultationSummary[] }>(`/consultations${query}`);
}

export function getConsultation(id: string) {
  return apiRequest<ConsultationSummary>(`/consultations/${id}`);
}

// clientUuid est généré une fois côté mobile (voir services/offline) à la création
// du brouillon et réutilisé à chaque sauvegarde — c'est la clé d'idempotence qui
// évite les doublons quand la synchro est rejouée après une coupure réseau.
export function saveDraft(clientUuid: string, draft: ConsultationDraft) {
  return apiRequest<ConsultationSummary>(`/consultations/draft/${clientUuid}`, {
    method: "PUT",
    body: sanitizeDraftAvailabilities(draft),
  });
}

export function recordConsent(consultationId: string, consentTextVersion: string) {
  return apiRequest(`/consultations/${consultationId}/consent`, { method: "POST", body: { consentTextVersion } });
}

export function submitConsultation(consultationId: string) {
  return apiRequest<ConsultationSummary>(`/consultations/${consultationId}/submit`, { method: "POST" });
}
