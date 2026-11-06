import type { ConsultationMode } from "../store/consultationDraftStore";

// Questionnaire consolidé en 6 étapes (contre 13 auparavant) — pertinent pour un
// usage terrain où l'on remplit beaucoup de dossiers à la suite : moins d'écrans à
// enchaîner, chaque étape regroupant les questions qui se répondent ensemble
// naturellement (voir StepXxx.tsx pour le détail de chaque regroupement).
type StepParams = { fromSummary?: boolean } | undefined;

export type ConsultationStackParamList = {
  Step1PersonalInfo: StepParams;
  Step2Problem: StepParams;
  Step3LesionAspect: StepParams;
  Step4Context: StepParams;
  Photos: StepParams;
  ConsentAvailabilities: StepParams;
  Summary: undefined;
  // `mode` est transmis explicitement ici plutôt que relu depuis
  // consultationDraftStore côté ConfirmationScreen : SummaryScreen appelle
  // `reset()` (qui remet mode à "patient") avant de naviguer ici, donc le store
  // ne reflète déjà plus le mode réel au moment où Confirmation s'affiche — voir
  // SummaryScreen#handleSubmit.
  // `refNumber` est `null` quand l'envoi a été mis en file (hors ligne, ou
  // photos pas encore reçues côté serveur — voir services/offline/submitQueue.ts) :
  // le numéro définitif n'est attribué par le serveur qu'à l'envoi réel.
  Confirmation: { refNumber: number | null; mode: ConsultationMode };
};

export const CONSULTATION_TOTAL_STEPS = 6;
