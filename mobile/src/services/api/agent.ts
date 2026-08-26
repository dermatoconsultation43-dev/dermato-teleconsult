import { apiRequest, apiUpload } from "./client";
import { sanitizeDraftAvailabilities } from "./availabilities";
import type { ConsultationDraft, ConsultationSummary, Photo, PhotoSlot } from "../../types/api";

// Miroir de services/api/consultations.ts + photos.ts, mais pour le mode "agent
// terrain" : un admin saisit un dossier complet pour un patient qui n'a pas de
// compte (voir backend/src/modules/agent). Même contrat de données, même machine
// à états — seul le préfixe de route change (/admin/agent-consultations au lieu
// de /consultations), voir agent.routes.ts côté backend qui réutilise les mêmes
// services métier que le parcours patient normal.

export function saveWalkInDraft(clientUuid: string, draft: ConsultationDraft) {
  return apiRequest<ConsultationSummary>(`/admin/agent-consultations/draft/${clientUuid}`, {
    method: "PUT",
    body: sanitizeDraftAvailabilities(draft),
  });
}

export function recordWalkInConsent(consultationId: string, consentTextVersion: string) {
  return apiRequest(`/admin/agent-consultations/${consultationId}/consent`, {
    method: "POST",
    body: { consentTextVersion },
  });
}

export function submitWalkInConsultation(consultationId: string) {
  return apiRequest<ConsultationSummary>(`/admin/agent-consultations/${consultationId}/submit`, { method: "POST" });
}

export function uploadWalkInPhoto(
  consultationId: string,
  input: { slot: PhotoSlot; localUri: string; mimeType: string; fileName?: string },
): Promise<Photo> {
  const formData = new FormData();
  formData.append("slot", input.slot);
  formData.append("file", {
    uri: input.localUri,
    type: input.mimeType,
    name: input.fileName ?? `${input.slot}.${input.mimeType.split("/")[1] ?? "jpg"}`,
  } as unknown as Blob);

  return apiUpload<Photo>(`/admin/agent-consultations/${consultationId}/photos`, formData);
}

export function deleteWalkInPhoto(consultationId: string, photoId: string) {
  return apiRequest<void>(`/admin/agent-consultations/${consultationId}/photos/${photoId}`, { method: "DELETE" });
}
