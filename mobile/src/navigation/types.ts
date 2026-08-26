// Un seul stack racine, dont le contenu change selon l'état d'auth (voir
// RootNavigator.tsx) plutôt que des navigateurs imbriqués Onboarding/Auth/App —
// plus simple à raisonner pour une V1, et suffisant tant qu'il n'y a pas de tabs
// avec état partagé à préserver entre les écrons patient.
export type RootStackParamList = {
  Onboarding: undefined;
  // Écran de connexion unique pour tous les rôles : le backend décide déjà
  // patient/admin/agent à partir du compte utilisé, la résolution de rôle après
  // connexion (voir RootNavigator) redirige automatiquement vers le bon espace.
  Login: undefined;
  SignUp: undefined;
  PatientDashboard: undefined;
  NewConsultation: undefined;
  MessagesList: undefined;
  ConsultationChat: { consultationId: string };
  AdminDashboard: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
