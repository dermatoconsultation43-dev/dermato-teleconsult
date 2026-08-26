import type { ConsultationStatus } from "../types/api";

export type AdminStackParamList = {
  AdminList: undefined;
  AdminConsultationsList: { initialFilter?: ConsultationStatus | "all" } | undefined;
  AdminConsultationDetail: { id: string };
  AdminEditConsultation: { id: string };
  AdminConsultationChat: { id: string };
  // Mode terrain (voir navigation/AgentNavigator.tsx) : navigateur imbriqué,
  // partagé avec le rôle "agent" — un admin peut aussi saisir un dossier complet
  // pour une personne sans compte.
  AgentFlow: undefined;
};
