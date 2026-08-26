import React, { useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StepScreen } from "./components/StepScreen";
import { ChoiceGroup } from "../../components/ChoiceGroup";
import { TextField } from "../../components/TextField";
import { YesNoToggle } from "../../components/YesNoToggle";
import { BodyMap } from "../../components/BodyMap";
import { useTheme } from "../../theme/useTheme";
import { useConsultationDraftStore } from "../../store/consultationDraftStore";
import { useSaveDraftStep } from "./useSaveDraftStep";
import { useIsDevPreview } from "../../hooks/useIsDevPreview";
import { listLesionTypes, type LesionTypeOption } from "../../services/api/lesionTypes";
import { CONSULTATION_TOTAL_STEPS, type ConsultationStackParamList } from "../../navigation/consultationTypes";

type Props = NativeStackScreenProps<ConsultationStackParamList, "Step3LesionAspect">;

// Photos de référence par type de lésion (mêmes images que le formulaire papier
// d'origine, fournies par le Dr Nguena) — décision produit explicite de les
// afficher malgré la réserve initialement notée en Phase 2 (voir historique) : le
// client souhaite reproduire le formulaire à l'identique, images incluses.
const LESION_IMAGES: Record<string, ReturnType<typeof require>> = {
  tache: require("../../assets/lesions/tache.jpg"),
  papule: require("../../assets/lesions/papule.jpg"),
  plaque: require("../../assets/lesions/plaque.jpg"),
  pustule: require("../../assets/lesions/pustule.jpg"),
  vesicule: require("../../assets/lesions/vesicule.jpg"),
  bulle: require("../../assets/lesions/bulle.jpg"),
  // Pas d'image pour "plaie" : la photo de référence (plaie ouverte) a choqué des
  // patients — l'option reste sélectionnable via son libellé/description seuls
  // (ChoiceGroup gère nativement une option sans image, voir gallery variant).
};

// Mode aperçu dev (voir LoginScreen) : copie locale du référentiel de
// backend/prisma/seed.ts, pour parcourir cet écran sans appel serveur possible.
const DEV_PREVIEW_LESION_TYPES: LesionTypeOption[] = [
  { code: "tache", labelFr: "Taches", description: "Zone de peau dont la couleur diffère, sans relief.", displayOrder: 1 },
  { code: "papule", labelFr: "Papules", description: "Petites lésions solides en relief.", displayOrder: 2 },
  { code: "plaque", labelFr: "Plaques", description: "Lésions plus larges, en relief ou non.", displayOrder: 3 },
  { code: "pustule", labelFr: "Pustules", description: "Petites lésions contenant du pus.", displayOrder: 4 },
  { code: "vesicule", labelFr: "Vésicules", description: "Petites lésions contenant du liquide clair.", displayOrder: 5 },
  { code: "bulle", labelFr: "Bulles / cloques", description: "Lésions contenant du liquide, plus larges qu'une vésicule.", displayOrder: 6 },
  { code: "plaie", labelFr: "Plaie", description: "Perte de substance de la peau.", displayOrder: 7 },
  { code: "autre", labelFr: "Autre", description: "Aspect non listé ci-dessus — à préciser.", displayOrder: 8 },
];

// Regroupe l'aspect des lésions (photos de référence), leur localisation (carte du
// corps) et les questions "autres lésions / zones sensibles" — tout ce qui décrit
// concrètement ce que le dermatologue va regarder, sur un seul écran.
export function Step3LesionAspect({ navigation }: Props) {
  const { colors, spacing, typography } = useTheme();
  const draft = useConsultationDraftStore((s) => s.draft);
  const updateDraft = useConsultationDraftStore((s) => s.updateDraft);
  const { saveAndContinue, saving, error } = useSaveDraftStep();
  const [localError, setLocalError] = useState<string | null>(null);
  const isDevPreview = useIsDevPreview();

  const { data, isLoading } = useQuery({
    queryKey: ["lesion-types"],
    queryFn: listLesionTypes,
    enabled: !isDevPreview,
  });
  const items = isDevPreview ? DEV_PREVIEW_LESION_TYPES : (data?.items ?? []);

  const selectedCodes = draft.lesionTypes?.map((l) => l.code) ?? [];
  const hasAutre = selectedCodes.includes("autre");

  function handleChange(nextCodes: string[]) {
    const previous = draft.lesionTypes ?? [];
    const next = nextCodes.map((code) => previous.find((l) => l.code === code) ?? { code });
    updateDraft({ lesionTypes: next });
  }

  function handleAutrePrecision(text: string) {
    const next = (draft.lesionTypes ?? []).map((l) => (l.code === "autre" ? { ...l, precision: text } : l));
    updateDraft({ lesionTypes: next });
  }

  function handleContinue() {
    setLocalError(null);
    saveAndContinue(() => navigation.navigate("Step4Context"));
  }

  return (
    <StepScreen
      step={3}
      totalSteps={CONSULTATION_TOTAL_STEPS}
      title="Aspect des lésions"
      subtitle="Vous pouvez sélectionner plusieurs réponses."
      onBack={() => navigation.goBack()}
      onContinue={handleContinue}
      canContinue
      saving={saving}
      error={localError ?? error}
    >
      {isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <ChoiceGroup
          variant="gallery"
          multiple
          options={items.map((item: LesionTypeOption) => ({
            value: item.code,
            label: item.labelFr,
            description: item.description ?? undefined,
            image: LESION_IMAGES[item.code],
          }))}
          selected={selectedCodes}
          onChange={handleChange}
        />
      )}

      {hasAutre ? (
        <TextField
          label="Précisez l'aspect observé"
          value={draft.lesionTypes?.find((l) => l.code === "autre")?.precision ?? ""}
          onChangeText={handleAutrePrecision}
          style={{ marginTop: spacing.lg }}
        />
      ) : null}

      <Text style={[typography.label, { color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.sm }]}>
        Où se situent les lésions ?
      </Text>
      <BodyMap selected={draft.lesionZones ?? []} onChange={(zones) => updateDraft({ lesionZones: zones })} />

      <TextField
        label="Où les lésions sont-elles apparues en premier ?"
        value={draft.localisationPremieresLesions ?? ""}
        onChangeText={(v) => updateDraft({ localisationPremieresLesions: v })}
        style={{ marginTop: spacing.xl }}
      />

      <Text style={[typography.label, { color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.sm }]}>
        Y a-t-il d'autres lésions, d'un aspect différent, ailleurs sur le corps ?
      </Text>
      <YesNoToggle value={draft.autresLesions} onChange={(value) => updateDraft({ autresLesions: value })} />
      {draft.autresLesions ? (
        <TextField
          label="Décrivez leur aspect"
          value={draft.autresLesionsAspect ?? ""}
          onChangeText={(v) => updateDraft({ autresLesionsAspect: v })}
          multiline
          numberOfLines={3}
          style={{ minHeight: 80, textAlignVertical: "top", marginTop: spacing.lg }}
        />
      ) : null}

      <Text style={[typography.label, { color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.sm }]}>
        Existe-t-il des lésions au niveau de la bouche, des yeux, des narines, de l'anus ou des parties génitales ?
      </Text>
      <YesNoToggle
        value={draft.zonesSensiblesAtteintes}
        onChange={(value) => updateDraft({ zonesSensiblesAtteintes: value })}
      />
      {draft.zonesSensiblesAtteintes ? (
        <TextField
          label="Précisez"
          value={draft.zonesSensiblesPrecision ?? ""}
          onChangeText={(v) => updateDraft({ zonesSensiblesPrecision: v })}
          style={{ marginTop: spacing.lg }}
        />
      ) : null}
    </StepScreen>
  );
}
