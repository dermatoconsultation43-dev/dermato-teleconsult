import React from "react";
import { Text } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StepScreen } from "./components/StepScreen";
import { ChoiceGroup } from "../../components/ChoiceGroup";
import { YesNoToggle } from "../../components/YesNoToggle";
import { TextField } from "../../components/TextField";
import { useTheme } from "../../theme/useTheme";
import { useConsultationDraftStore } from "../../store/consultationDraftStore";
import { useSaveDraftStep } from "./useSaveDraftStep";
import { CONSULTATION_TOTAL_STEPS, type ConsultationStackParamList } from "../../navigation/consultationTypes";

type Props = NativeStackScreenProps<ConsultationStackParamList, "Step4Context">;

const ENTOURAGE_OPTIONS = [
  { value: "oui", label: "Oui" },
  { value: "non", label: "Non" },
  { value: "ne_sait_pas", label: "Je ne sais pas" },
];

// Regroupe entourage + produits utilisés + antécédents médicaux : trois questions
// de contexte, indépendantes les unes des autres, qui n'ont pas besoin d'écrans
// séparés (voir demande de consolidation 13 -> 6 étapes). Entourage et antécédents
// sont des questions fermées, sans champ "Précisez", et le champ libre "Autres
// informations" a été retiré (demande client) — les colonnes restent en base pour
// les dossiers déjà saisis.
export function Step4Context({ navigation }: Props) {
  const { colors, spacing, typography } = useTheme();
  const draft = useConsultationDraftStore((s) => s.draft);
  const updateDraft = useConsultationDraftStore((s) => s.updateDraft);
  const { saveAndContinue, saving, error } = useSaveDraftStep();

  return (
    <StepScreen
      step={4}
      totalSteps={CONSULTATION_TOTAL_STEPS}
      title="Contexte"
      icon="users"
      onBack={() => navigation.goBack()}
      onContinue={() => saveAndContinue(() => navigation.navigate("Photos"))}
      continueLabel="Continuer vers les photos"
      saving={saving}
      error={error}
    >
      <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.sm }]}>Entourage</Text>
      <Text style={[typography.label, { color: colors.text, marginBottom: spacing.sm }]}>
        Une autre personne de votre entourage présente-t-elle des lésions similaires ou des démangeaisons ?
      </Text>
      <ChoiceGroup
        options={ENTOURAGE_OPTIONS}
        selected={draft.entourageStatus ? [draft.entourageStatus] : []}
        onChange={([value]) => updateDraft({ entourageStatus: value as typeof draft.entourageStatus })}
      />

      <Text style={[typography.h2, { color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.sm }]}>
        Produits et traitements utilisés
      </Text>
      <Text style={[typography.bodyMuted, { color: colors.textMuted, marginBottom: spacing.sm }]}>
        Comprimés, crèmes, pommades, produits traditionnels, savons, laits corporels, produits éclaircissants...
      </Text>
      <YesNoToggle value={draft.produitsUtilises} onChange={(value) => updateDraft({ produitsUtilises: value })} />
      {draft.produitsUtilises ? (
        <TextField
          label="Précisez les produits utilisés"
          value={draft.produitsPrecision ?? ""}
          onChangeText={(v) => updateDraft({ produitsPrecision: v })}
          multiline
          numberOfLines={3}
          style={{ minHeight: 80, textAlignVertical: "top", marginTop: spacing.lg }}
        />
      ) : null}

      <Text style={[typography.h2, { color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.sm }]}>
        Antécédents
      </Text>
      <Text style={[typography.label, { color: colors.text, marginBottom: spacing.sm }]}>
        Avez-vous une maladie chronique, ou une maladie pour laquelle vous êtes suivi(e) ou prenez régulièrement des
        médicaments ?
      </Text>
      <YesNoToggle value={draft.antecedentsMedicaux} onChange={(value) => updateDraft({ antecedentsMedicaux: value })} />
    </StepScreen>
  );
}
