import { apiRequest } from "./client";
import type { Message } from "../../types/api";

// Ouvrir le fil marque déjà les messages comme lus côté backend (voir
// messages.service.ts#listMessages) — pas d'appel "marquer comme lu" séparé.
export function listMessages(consultationId: string) {
  return apiRequest<{ items: Message[] }>(`/consultations/${consultationId}/messages`);
}

export function sendMessage(consultationId: string, body: string) {
  return apiRequest<Message>(`/consultations/${consultationId}/messages`, { method: "POST", body: { body } });
}
