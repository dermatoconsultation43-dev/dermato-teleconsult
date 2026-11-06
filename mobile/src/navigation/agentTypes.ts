// Pile dédiée au mode terrain : réutilisée à deux endroits — comme navigateur
// racine pour un compte de rôle "agent" (voir RootNavigator.tsx), et imbriquée
// dans AdminNavigator pour l'action rapide "Nouveau dossier terrain" d'un
// administrateur (voir AdminNavigator.tsx). Volontairement minimale : un agent
// n'a accès qu'à ces deux écrans, rien d'autre de l'espace admin.
export type AgentStackParamList = {
  AgentNewConsultationStart: undefined;
  AgentSync: undefined;
  AgentConsultation: undefined;
};
