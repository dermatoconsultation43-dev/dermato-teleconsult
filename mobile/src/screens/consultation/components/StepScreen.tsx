import React, { PropsWithChildren } from "react";
import { Text, View } from "react-native";
import { ScreenContainer } from "../../../components/ScreenContainer";
import { ProgressStep } from "../../../components/ProgressStep";
import { Button } from "../../../components/Button";
import { Icon, IconName } from "../../../components/icons/Icon";
import { useTheme } from "../../../theme/useTheme";
import { useSummaryReturn } from "../useSummaryReturn";

interface StepScreenProps {
  step: number;
  totalSteps: number;
  title: string;
  subtitle?: string;
  /** Pictogramme affiché dans le badge en tête d'étape — même motif "icône dans un
   * cercle accentSoft" que les slides d'onboarding, pour que le questionnaire se
   * lise comme une continuité visuelle de l'onboarding plutôt qu'un espace à part. */
  icon?: IconName;
  onBack?: () => void;
  onContinue: () => void;
  continueLabel?: string;
  canContinue?: boolean;
  saving?: boolean;
  error?: string | null;
}

// Coquille commune à toutes les étapes du questionnaire : même badge + barre de
// progression, mêmes boutons Continuer/Retour, même emplacement pour l'indicateur
// de sauvegarde automatique. Documenté une fois ici plutôt que dans chaque écran.
export function StepScreen({
  step,
  totalSteps,
  title,
  subtitle,
  icon = "clipboard",
  onBack,
  onContinue,
  continueLabel = "Continuer",
  canContinue = true,
  saving,
  error,
  children,
}: PropsWithChildren<StepScreenProps>) {
  const { colors, spacing, radius, typography } = useTheme();
  const { fromSummary, returnToSummary } = useSummaryReturn();
  const backAction = fromSummary ? returnToSummary : onBack;

  return (
    <ScreenContainer>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.lg }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: radius.lg,
            backgroundColor: colors.accentSoft,
            alignItems: "center",
            justifyContent: "center",
            marginRight: spacing.md,
          }}
        >
          <Icon name={icon} size={24} color={colors.accentStrong} strokeWidth={1.6} />
        </View>
        <Text style={[typography.h2, { color: colors.text, flex: 1 }]}>{title}</Text>
      </View>

      <ProgressStep currentStep={step} totalSteps={totalSteps} />

      {subtitle ? (
        <Text style={[typography.bodyMuted, { color: colors.textMuted, marginBottom: spacing.xl }]}>{subtitle}</Text>
      ) : null}

      <View style={{ marginBottom: spacing.xl }}>{children}</View>

      {error ? (
        <Text style={[typography.bodyMuted, { color: colors.danger, marginBottom: spacing.lg }]}>{error}</Text>
      ) : null}

      <View style={{ gap: spacing.md, marginTop: spacing.md }}>
        <Button label={fromSummary ? "Enregistrer et revenir au résumé" : continueLabel} onPress={onContinue} disabled={!canContinue} loading={saving} />
        {backAction ? <Button label="Retour" variant="ghost" onPress={backAction} /> : null}
      </View>
    </ScreenContainer>
  );
}
