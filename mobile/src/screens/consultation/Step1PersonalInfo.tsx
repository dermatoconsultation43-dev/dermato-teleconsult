import React, { useState } from "react";
import { Text } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StepScreen } from "./components/StepScreen";
import { TextField } from "../../components/TextField";
import { ChoiceGroup } from "../../components/ChoiceGroup";
import { useTheme } from "../../theme/useTheme";
import { useConsultationDraftStore } from "../../store/consultationDraftStore";
import { useSaveDraftStep } from "./useSaveDraftStep";
import { CONSULTATION_TOTAL_STEPS, type ConsultationStackParamList } from "../../navigation/consultationTypes";

type Props = NativeStackScreenProps<ConsultationStackParamList, "Step1PersonalInfo">;

// Pas de date-picker natif installé dans l'app — champ texte au format français
// habituel, converti en ISO (attendu par le backend, voir consultationDraftSchema)
// seulement une fois la saisie complète, pour ne pas gêner la frappe.
const FR_DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function frDateToIso(text: string): string | undefined {
  const match = FR_DATE_RE.exec(text.trim());
  if (!match) return undefined;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function isoDateToFr(iso: string | undefined): string {
  if (!iso) return "";
  const [year, month, day] = iso.split("-");
  return day && month && year ? `${day}/${month}/${year}` : "";
}

const STATUT_OPTIONS = [
  { value: "celibataire", label: "Célibataire" },
  { value: "marie", label: "Marié(e)" },
  { value: "vie_en_couple", label: "Vie en couple" },
  { value: "veuf_veuve", label: "Veuf/Veuve" },
  { value: "autre", label: "Autre" },
];

export function Step1PersonalInfo({ navigation }: Props) {
  const { colors, spacing, typography } = useTheme();
  const draft = useConsultationDraftStore((s) => s.draft);
  const updateDraft = useConsultationDraftStore((s) => s.updateDraft);
  const { saveAndContinue, saving, error } = useSaveDraftStep();
  const [localError, setLocalError] = useState<string | null>(null);
  const [dateNaissanceText, setDateNaissanceText] = useState(() => isoDateToFr(draft.dateNaissance));

  function handleDateNaissanceChange(text: string) {
    setDateNaissanceText(text);
    updateDraft({ dateNaissance: frDateToIso(text) });
  }

  const canContinue = Boolean(
    draft.nomComplet && draft.sexe && draft.age && draft.telephoneContact && draft.confirmationWhatsapp !== undefined,
  );

  function handleContinue() {
    if (!draft.nomComplet || !draft.sexe || !draft.age || !draft.telephoneContact || draft.confirmationWhatsapp === undefined) {
      setLocalError("Nom complet, sexe, âge, numéro de téléphone et confirmation par WhatsApp sont requis.");
      return;
    }
    setLocalError(null);
    saveAndContinue(() => navigation.navigate("Step2Problem"));
  }

  return (
    <StepScreen
      step={1}
      totalSteps={CONSULTATION_TOTAL_STEPS}
      title="Informations personnelles"
      icon="user"
      onContinue={handleContinue}
      canContinue={canContinue}
      saving={saving}
      error={localError ?? error}
    >
      <TextField
        label="Nom complet *"
        value={draft.nomComplet ?? ""}
        onChangeText={(v) => updateDraft({ nomComplet: v })}
        style={{ marginBottom: spacing.xl }}
      />

      <Text style={[typography.label, { color: colors.text, marginBottom: spacing.sm }]}>Sexe *</Text>
      <ChoiceGroup
        options={[
          { value: "M", label: "Masculin" },
          { value: "F", label: "Féminin" },
        ]}
        selected={draft.sexe ? [draft.sexe] : []}
        onChange={([value]) => updateDraft({ sexe: value as "M" | "F" })}
      />

      <Text style={[typography.label, { color: colors.text, marginTop: spacing.xl, marginBottom: spacing.sm }]}>
        Statut matrimonial
      </Text>
      <ChoiceGroup
        options={STATUT_OPTIONS}
        selected={draft.statutMatrimonial ? [draft.statutMatrimonial] : []}
        onChange={([value]) => updateDraft({ statutMatrimonial: value as typeof draft.statutMatrimonial })}
      />

      <TextField
        label="Âge *"
        value={draft.age ? String(draft.age) : ""}
        onChangeText={(v) => updateDraft({ age: v ? Number(v.replace(/[^0-9]/g, "")) : undefined })}
        keyboardType="number-pad"
        style={{ marginTop: spacing.xl }}
      />
      <TextField
        label="Date de naissance (JJ/MM/AAAA)"
        value={dateNaissanceText}
        onChangeText={handleDateNaissanceChange}
        keyboardType="number-pad"
      />
      <TextField label="Ville de résidence" value={draft.ville ?? ""} onChangeText={(v) => updateDraft({ ville: v })} />
      <TextField label="Profession" value={draft.profession ?? ""} onChangeText={(v) => updateDraft({ profession: v })} />
      <TextField
        label="Numéro de téléphone *"
        value={draft.telephoneContact ?? ""}
        onChangeText={(v) => updateDraft({ telephoneContact: v })}
        keyboardType="phone-pad"
      />
      <TextField
        label="Email"
        value={draft.emailContact ?? ""}
        onChangeText={(v) => updateDraft({ emailContact: v })}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <Text style={[typography.label, { color: colors.text, marginTop: spacing.xl, marginBottom: spacing.sm }]}>
        Confirmation par WhatsApp *
      </Text>
      <ChoiceGroup
        options={[
          { value: "oui", label: "Oui" },
          { value: "non", label: "Non" },
        ]}
        selected={draft.confirmationWhatsapp === undefined ? [] : [draft.confirmationWhatsapp ? "oui" : "non"]}
        onChange={([value]) => updateDraft({ confirmationWhatsapp: value === "oui" })}
      />

      <TextField
        label="Poids (kg)"
        value={draft.poidsKg ? String(draft.poidsKg) : ""}
        onChangeText={(v) => updateDraft({ poidsKg: v ? Number(v.replace(",", ".")) : undefined })}
        keyboardType="decimal-pad"
      />
      <TextField
        label="Taille (cm)"
        value={draft.tailleCm ? String(draft.tailleCm) : ""}
        onChangeText={(v) => updateDraft({ tailleCm: v ? Number(v.replace(",", ".")) : undefined })}
        keyboardType="decimal-pad"
      />
      <TextField
        label="Température (°C)"
        value={draft.temperatureC ? String(draft.temperatureC) : ""}
        onChangeText={(v) => updateDraft({ temperatureC: v ? Number(v.replace(",", ".")) : undefined })}
        keyboardType="decimal-pad"
      />
    </StepScreen>
  );
}
