import { z } from "zod";

export const consultationIdParamSchema = z.object({ consultationId: z.string().uuid() });

// Réutilisé tel quel côté admin (admin.routes.ts) : même règle de longueur/contenu
// des deux côtés du fil, pas de raison que l'un accepte ce que l'autre refuse.
export const sendMessageBodySchema = z.object({
  body: z.string().trim().min(1).max(2000),
});
