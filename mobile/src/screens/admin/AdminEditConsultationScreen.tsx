import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { ChoiceGroup } from "../../components/ChoiceGroup";
import { YesNoToggle } from "../../components/YesNoToggle";
import { BodyMap } from "../../components/BodyMap";
import { useTheme } from "../../theme/useTheme";
import { getAdminConsultationDetail, updateConsultationFields } from "../../services/api/admin";
import { listLesionTypes, type LesionTypeOption } from "../../services/api/lesionTypes";
import { listAvailabilities } from "../../services/api/availabilities";
import { ApiError } from "../../services/api/client";
import { frDateToIso, isoDateToFr, STATUT_OPTIONS } from "../consultation/Step1PersonalInfo";
import type { AdminStackParamList } from "../../navigation/adminTypes";
import type { AdminConsultationDetail, Availability, ConsultationDraft } from "../../types/api";

type Props = NativeStackScreenProps<AdminStackParamList, "AdminEditConsultation">;

const DUREE_UNITE_OPTIONS = [
  { value: "jours", label: "Jours" },
  { value: "semaines", label: "Semaines" },
  { value: "mois", label: "Mois" },
  { value: "annees", label: "Années" },
];
const DEMANGEAISON_OPTIONS = [
  { value: "oui", label: "Oui" },
  { value: "non", label: "Non" },
  { value: "parfois", label: "Parfois" },
  { value: "nuit", label: "Principalement le soir ou la nuit" },
];
const ENTOURAGE_OPTIONS = [
  { value: "oui", label: "Oui" },
  { value: "non", label: "Non" },
  { value: "ne_sait_pas", label: "Je ne sais pas" },
];
const AUTRE_AVAILABILITY = "autre";

// Champs envoyés à PATCH /admin/consultations/:id/fields — liste explicite plutôt
// que tout l'objet du détail admin (id, statut, photos, patient...), que le schéma
// serveur ignorerait de toute façon.
const EDITABLE_KEYS: Array<keyof ConsultationDraft> = [
  "nomComplet", "sexe", "statutMatrimonial", "age", "dateNaissance", "ville", "profession",
  "telephoneContact", "emailContact", "confirmationWhatsapp", "poidsKg", "tailleCm", "temperatureC",
  "motif", "conseilCosmetiqueDemande", "conseilCosmetiquePrecision", "dureeValeur", "dureeUnite",
  "localisationPremieresLesions", "demangeaison", "lesionZones", "autresLesions", "autresLesionsAspect",
  "autresLesionsLocalisation", "zonesSensiblesAtteintes", "zonesSensiblesPrecision", "entourageStatus",
  "produitsUtilises", "produitsPrecision", "antecedentsMedicaux", "photosQualiteConfirmee", "lesionTypes", "availabilities",
];

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// Le détail admin n'a pas la forme d'un brouillon : null au lieu de champs absents,
// décimaux Prisma renvoyés en chaîne ("62.5"), date de naissance en ISO complet,
// lesionTypes/availabilities avec leurs relations. On le ramène au format brouillon
// pour réutiliser les mêmes champs que le questionnaire.
function detailToForm(detail: AdminConsultationDetail): ConsultationDraft {
  const form: Record<string, unknown> = {};
  for (const key of EDITABLE_KEYS) {
    const value = (detail as unknown as Record<string, unknown>)[key];
    if (value !== null && value !== undefined) form[key] = value;
  }
  return {
    ...(form as ConsultationDraft),
    poidsKg: toNumber(detail.poidsKg),
    tailleCm: toNumber(detail.tailleCm),
    temperatureC: toNumber(detail.temperatureC),
    dateNaissance: detail.dateNaissance ? detail.dateNaissance.slice(0, 10) : undefined,
    lesionTypes: detail.lesionTypes.map((l) => ({ code: l.lesionCode, ...(l.precision ? { precision: l.precision } : {}) })),
    availabilities: detail.availabilities.map((a) =>
      a.availability ? { availabilityId: a.availability.id } : { autrePrecision: a.autrePrecision ?? "" },
    ),
  };
}

// Champs vides retirés : le serveur refuse une chaîne vide pour certains champs
// (nom, téléphone, motif...) et un champ absent laisse simplement la valeur en base.
function formToPayload(form: ConsultationDraft): Partial<ConsultationDraft> {
  const payload: Record<string, unknown> = {};
  for (const key of EDITABLE_KEYS) {
    const value = form[key];
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    payload[key] = value;
  }
  // Une entrée "Autres plages" laissée vide serait refusée par le serveur (il exige
  // un créneau ou une précision) : on ne l'envoie pas.
  if (form.availabilities) {
    payload.availabilities = form.availabilities.filter((a) => a.availabilityId || a.autrePrecision?.trim());
  }
  return payload as Partial<ConsultationDraft>;
}

// Corrige le contenu d'un dossier déjà soumis — utile sur le terrain quand une
// erreur de saisie est repérée parmi de nombreux dossiers (voir
// PATCH /admin/consultations/:id/fields, qui accepte le même format que le
// brouillon patient). Reprend toutes les questions du questionnaire, champs
// "Précisez" toujours visibles pour que l'admin voie tout ce qui a été saisi.
export function AdminEditConsultationScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const { colors, spacing, typography } = useTheme();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["admin", "consultation", id],
    queryFn: () => getAdminConsultationDetail(id),
  });
  const lesionTypesQuery = useQuery({ queryKey: ["lesion-types"], queryFn: listLesionTypes });
  const availabilitiesQuery = useQuery({ queryKey: ["availabilities"], queryFn: listAvailabilities });

  const [form, setForm] = useState<ConsultationDraft | null>(null);
  const [dateNaissanceText, setDateNaissanceText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.data && !form) {
      const initial = detailToForm(query.data);
      setForm(initial);
      setDateNaissanceText(isoDateToFr(initial.dateNaissance));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  function patch(fields: Partial<ConsultationDraft>) {
    setForm((prev) => (prev ? { ...prev, ...fields } : prev));
  }

  const mutation = useMutation({
    mutationFn: (input: Partial<ConsultationDraft>) => updateConsultationFields(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "consultation", id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "consultations"] });
      navigation.goBack();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Impossible d'enregistrer les modifications.");
    },
  });

  function handleSave() {
    if (!form) return;
    setError(null);
    mutation.mutate(formToPayload(form));
  }

  if (query.isLoading || (!form && !query.isError)) {
    return (
      <ScreenContainer>
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  if (query.isError || !form || !query.data) {
    return (
      <ScreenContainer>
        <Card>
          <Text style={[typography.body, { color: colors.text }]}>Impossible de charger ce dossier.</Text>
          <View style={{ marginTop: spacing.md }}>
            <Button label="Réessayer" variant="secondary" onPress={() => query.refetch()} />
          </View>
        </Card>
      </ScreenContainer>
    );
  }

  const detail: AdminConsultationDetail = query.data;

  // Types de lésion : référentiel serveur, complété par ceux déjà présents dans le
  // dossier (au cas où le référentiel n'a pas pu être chargé).
  const lesionOptions = lesionTypesQuery.data?.items?.length
    ? lesionTypesQuery.data.items.map((l: LesionTypeOption) => ({ value: l.code, label: l.labelFr }))
    : detail.lesionTypes.map((l) => ({ value: l.lesionCode, label: l.lesionType.labelFr }));
  const selectedLesionCodes = form.lesionTypes?.map((l) => l.code) ?? [];
  const autreLesion = form.lesionTypes?.find((l) => l.code === "autre");

  const availabilityOptions = [
    ...(availabilitiesQuery.data?.items ?? detail.availabilities.flatMap((a) => (a.availability ? [a.availability] : []))).map(
      (a: Availability) => ({ value: a.id, label: a.label }),
    ),
    { value: AUTRE_AVAILABILITY, label: "Autres plages" },
  ];
  const selectedAvailabilityIds = (form.availabilities ?? []).flatMap((a) => (a.availabilityId ? [a.availabilityId] : []));
  // Plusieurs entrées "autre" possibles en base (ex. créneaux saisis hors ligne,
  // voir sanitizeDraftAvailabilities) : regroupées en un seul champ texte ici.
  const autreAvailabilityText = (form.availabilities ?? [])
    .filter((a) => !a.availabilityId)
    .map((a) => a.autrePrecision ?? "")
    .join(", ");
  const hasAutreAvailability = (form.availabilities ?? []).some((a) => !a.availabilityId);

  function setAvailabilities(ids: string[], autre: string | null) {
    patch({
      availabilities: [...ids.map((availabilityId) => ({ availabilityId })), ...(autre !== null ? [{ autrePrecision: autre }] : [])],
    });
  }

  const sectionTitle = [typography.h2, { color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.md }];
  const label = [typography.label, { color: colors.text, marginTop: spacing.xl, marginBottom: spacing.sm }];

  return (
    <ScreenContainer>
      <Button label="← Annuler" variant="ghost" fullWidth={false} onPress={() => navigation.goBack()} />
      <Text style={[typography.h1, { color: colors.text, marginTop: spacing.lg, marginBottom: spacing.lg }]}>
        Modifier le dossier n° {detail.refNumber}
      </Text>

      <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.md }]}>Informations personnelles</Text>
      <TextField label="Code du patient" value={form.nomComplet ?? ""} onChangeText={(v) => patch({ nomComplet: v })} />
      <Text style={label}>Sexe</Text>
      <ChoiceGroup
        options={[
          { value: "M", label: "Masculin" },
          { value: "F", label: "Féminin" },
        ]}
        selected={form.sexe ? [form.sexe] : []}
        onChange={([v]) => patch({ sexe: v as "M" | "F" })}
      />
      <Text style={label}>Statut matrimonial</Text>
      <ChoiceGroup
        options={STATUT_OPTIONS}
        selected={form.statutMatrimonial ? [form.statutMatrimonial] : []}
        onChange={([v]) => patch({ statutMatrimonial: v as ConsultationDraft["statutMatrimonial"] })}
      />
      <TextField
        label="Âge"
        value={form.age ? String(form.age) : ""}
        onChangeText={(v) => patch({ age: v ? Number(v.replace(/[^0-9]/g, "")) : undefined })}
        keyboardType="number-pad"
        style={{ marginTop: spacing.xl }}
      />
      <TextField
        label="Date de naissance (JJ/MM/AAAA)"
        value={dateNaissanceText}
        onChangeText={(v) => {
          setDateNaissanceText(v);
          patch({ dateNaissance: frDateToIso(v) });
        }}
        keyboardType="number-pad"
      />
      <TextField label="Ville de résidence" value={form.ville ?? ""} onChangeText={(v) => patch({ ville: v })} />
      <TextField label="Profession" value={form.profession ?? ""} onChangeText={(v) => patch({ profession: v })} />
      <TextField
        label="Numéro de téléphone"
        value={form.telephoneContact ?? ""}
        onChangeText={(v) => patch({ telephoneContact: v })}
        keyboardType="phone-pad"
      />
      <TextField
        label="Email"
        value={form.emailContact ?? ""}
        onChangeText={(v) => patch({ emailContact: v })}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Text style={label}>Confirmation par WhatsApp</Text>
      <YesNoToggle value={form.confirmationWhatsapp} onChange={(v) => patch({ confirmationWhatsapp: v })} />
      <TextField
        label="Poids (kg)"
        value={form.poidsKg !== undefined ? String(form.poidsKg) : ""}
        onChangeText={(v) => patch({ poidsKg: toNumber(v.replace(",", ".")) })}
        keyboardType="decimal-pad"
        style={{ marginTop: spacing.xl }}
      />
      <TextField
        label="Taille (cm)"
        value={form.tailleCm !== undefined ? String(form.tailleCm) : ""}
        onChangeText={(v) => patch({ tailleCm: toNumber(v.replace(",", ".")) })}
        keyboardType="decimal-pad"
      />
      <TextField
        label="Température (°C)"
        value={form.temperatureC !== undefined ? String(form.temperatureC) : ""}
        onChangeText={(v) => patch({ temperatureC: toNumber(v.replace(",", ".")) })}
        keyboardType="decimal-pad"
      />

      <Text style={sectionTitle}>Le problème</Text>
      <TextField
        label="Plaintes"
        value={form.motif ?? ""}
        onChangeText={(v) => patch({ motif: v })}
        multiline
        numberOfLines={4}
        style={{ minHeight: 100, textAlignVertical: "top" }}
      />
      <Text style={label}>Conseil cosmétique demandé</Text>
      <YesNoToggle value={form.conseilCosmetiqueDemande} onChange={(v) => patch({ conseilCosmetiqueDemande: v })} />
      <TextField
        label="Précision conseil cosmétique"
        value={form.conseilCosmetiquePrecision ?? ""}
        onChangeText={(v) => patch({ conseilCosmetiquePrecision: v })}
        style={{ marginTop: spacing.lg }}
      />
      <TextField
        label="Durée (nombre)"
        value={form.dureeValeur ? String(form.dureeValeur) : ""}
        onChangeText={(v) => patch({ dureeValeur: v ? Number(v.replace(/[^0-9]/g, "")) : undefined })}
        keyboardType="number-pad"
        style={{ maxWidth: 140, marginTop: spacing.lg }}
      />
      <Text style={[typography.label, { color: colors.text, marginTop: spacing.sm, marginBottom: spacing.sm }]}>Unité</Text>
      <ChoiceGroup
        variant="pills"
        options={DUREE_UNITE_OPTIONS}
        selected={form.dureeUnite ? [form.dureeUnite] : []}
        onChange={([v]) => patch({ dureeUnite: v as ConsultationDraft["dureeUnite"] })}
      />
      <Text style={label}>Démangeaisons</Text>
      <ChoiceGroup
        options={DEMANGEAISON_OPTIONS}
        selected={form.demangeaison ? [form.demangeaison] : []}
        onChange={([v]) => patch({ demangeaison: v as ConsultationDraft["demangeaison"] })}
      />

      <Text style={sectionTitle}>Aspect et localisation des lésions</Text>
      <ChoiceGroup
        variant="pills"
        multiple
        options={lesionOptions}
        selected={selectedLesionCodes}
        onChange={(codes) => {
          const previous = form.lesionTypes ?? [];
          patch({ lesionTypes: codes.map((code) => previous.find((l) => l.code === code) ?? { code }) });
        }}
      />
      {autreLesion ? (
        <TextField
          label="Précisez l'aspect observé"
          value={autreLesion.precision ?? ""}
          onChangeText={(text) =>
            patch({ lesionTypes: (form.lesionTypes ?? []).map((l) => (l.code === "autre" ? { ...l, precision: text } : l)) })
          }
          style={{ marginTop: spacing.lg }}
        />
      ) : null}
      <Text style={label}>Zones du corps touchées</Text>
      <BodyMap selected={form.lesionZones ?? []} onChange={(zones) => patch({ lesionZones: zones })} />
      <TextField
        label="Autres localisations"
        value={form.autresLesionsLocalisation ?? ""}
        onChangeText={(v) => patch({ autresLesionsLocalisation: v })}
        style={{ marginTop: spacing.xl }}
      />
      <TextField
        label="Où les lésions sont-elles apparues en premier ?"
        value={form.localisationPremieresLesions ?? ""}
        onChangeText={(v) => patch({ localisationPremieresLesions: v })}
      />
      <Text style={label}>Autres lésions d'un aspect différent</Text>
      <YesNoToggle value={form.autresLesions} onChange={(v) => patch({ autresLesions: v })} />
      <TextField
        label="Aspect des autres lésions"
        value={form.autresLesionsAspect ?? ""}
        onChangeText={(v) => patch({ autresLesionsAspect: v })}
        style={{ marginTop: spacing.lg }}
      />
      <Text style={label}>Zones sensibles atteintes (bouche, yeux, narines, anus, parties génitales)</Text>
      <YesNoToggle value={form.zonesSensiblesAtteintes} onChange={(v) => patch({ zonesSensiblesAtteintes: v })} />
      <TextField
        label="Précision zones sensibles"
        value={form.zonesSensiblesPrecision ?? ""}
        onChangeText={(v) => patch({ zonesSensiblesPrecision: v })}
        style={{ marginTop: spacing.lg }}
      />

      <Text style={sectionTitle}>Contexte</Text>
      <Text style={[typography.label, { color: colors.text, marginBottom: spacing.sm }]}>Cas similaires dans l'entourage</Text>
      <ChoiceGroup
        options={ENTOURAGE_OPTIONS}
        selected={form.entourageStatus ? [form.entourageStatus] : []}
        onChange={([v]) => patch({ entourageStatus: v as ConsultationDraft["entourageStatus"] })}
      />
      <Text style={label}>Produits et traitements utilisés</Text>
      <YesNoToggle value={form.produitsUtilises} onChange={(v) => patch({ produitsUtilises: v })} />
      <TextField
        label="Précision produits"
        value={form.produitsPrecision ?? ""}
        onChangeText={(v) => patch({ produitsPrecision: v })}
        style={{ marginTop: spacing.lg }}
      />
      <Text style={label}>Antécédents médicaux (maladie chronique, traitement suivi)</Text>
      <YesNoToggle value={form.antecedentsMedicaux} onChange={(v) => patch({ antecedentsMedicaux: v })} />

      <Text style={sectionTitle}>Photos et disponibilités</Text>
      <Text style={[typography.label, { color: colors.text, marginBottom: spacing.sm }]}>
        Photos nettes et de bonne qualité ({detail.photos.length} photo(s) dans le dossier)
      </Text>
      <YesNoToggle value={form.photosQualiteConfirmee} onChange={(v) => patch({ photosQualiteConfirmee: v })} />
      <Text style={label}>Disponibilités</Text>
      <ChoiceGroup
        multiple
        options={availabilityOptions}
        selected={hasAutreAvailability ? [...selectedAvailabilityIds, AUTRE_AVAILABILITY] : selectedAvailabilityIds}
        onChange={(values) =>
          setAvailabilities(
            values.filter((v) => v !== AUTRE_AVAILABILITY),
            values.includes(AUTRE_AVAILABILITY) ? autreAvailabilityText : null,
          )
        }
      />
      {hasAutreAvailability ? (
        <TextField
          label="Autres plages"
          value={autreAvailabilityText}
          onChangeText={(text) => setAvailabilities(selectedAvailabilityIds, text)}
          style={{ marginTop: spacing.lg }}
        />
      ) : null}

      {error ? (
        <Text style={[typography.bodyMuted, { color: colors.danger, marginTop: spacing.lg }]}>{error}</Text>
      ) : null}

      <View style={{ marginTop: spacing.xl, marginBottom: spacing.xxl }}>
        <Button label="Enregistrer les modifications" onPress={handleSave} loading={mutation.isPending} />
      </View>
    </ScreenContainer>
  );
}
