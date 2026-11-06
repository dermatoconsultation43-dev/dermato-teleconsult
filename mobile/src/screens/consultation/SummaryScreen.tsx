import React, { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { Icon } from "../../components/icons/Icon";
import { BODY_ZONE_LABELS } from "../../components/BodyMap";
import { useTheme } from "../../theme/useTheme";
import { useConsultationDraftStore } from "../../store/consultationDraftStore";
import { useOfflineStore } from "../../store/offlineStore";
import { useIsDevPreview } from "../../hooks/useIsDevPreview";
import { submitConsultation } from "../../services/api/consultations";
import { submitWalkInConsultation } from "../../services/api/agent";
import { queueSubmitLocally } from "../../services/offline/submitQueue";
import { ApiError } from "../../services/api/client";
import { listAvailabilities } from "../../services/api/availabilities";
import { listLesionTypes, type LesionTypeOption } from "../../services/api/lesionTypes";
import { refreshPendingCount } from "../../services/offline/syncEngine";
import { FALLBACK_AVAILABILITIES } from "./ConsentAvailabilities";
import { isoDateToFr, STATUT_OPTIONS } from "./Step1PersonalInfo";
import { FALLBACK_LESION_TYPES } from "./Step3LesionAspect";
import type { ConsultationStackParamList } from "../../navigation/consultationTypes";
import type { Availability } from "../../types/api";

type Props = NativeStackScreenProps<ConsultationStackParamList, "Summary">;

const DUREE_UNITE_LABELS: Record<string, string> = { jours: "jour(s)", semaines: "semaine(s)", mois: "mois", annees: "année(s)" };
function yesNo(value: boolean | undefined): string | undefined {
  return value === undefined ? undefined : value ? "Oui" : "Non";
}

function withUnit(value: number | undefined, unit: string): string | undefined {
  return value === undefined ? undefined : `${value} ${unit}`;
}

export function SummaryScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const mode = useConsultationDraftStore((s) => s.mode);
  const clientUuid = useConsultationDraftStore((s) => s.clientUuid);
  const draft = useConsultationDraftStore((s) => s.draft);
  const photos = useConsultationDraftStore((s) => s.photos);
  const consultationId = useConsultationDraftStore((s) => s.consultationId);
  const reset = useConsultationDraftStore((s) => s.reset);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDevPreview = useIsDevPreview();
  const isOnline = useOfflineStore((s) => s.isOnline);
  const consentGiven = useConsultationDraftStore((s) => s.consentGiven);

  // Mêmes clés de cache que les étapes 3 et 6 : pas d'appel de plus en temps normal,
  // et les listes locales prennent le relais hors ligne.
  const lesionTypesQuery = useQuery({ queryKey: ["lesion-types"], queryFn: listLesionTypes, enabled: !isDevPreview });
  const availabilitiesQuery = useQuery({ queryKey: ["availabilities"], queryFn: listAvailabilities, enabled: !isDevPreview });
  const lesionOptions: LesionTypeOption[] = lesionTypesQuery.data?.items?.length ? lesionTypesQuery.data.items : FALLBACK_LESION_TYPES;
  const availabilityOptions: Availability[] = availabilitiesQuery.data?.items?.length ? availabilitiesQuery.data.items : FALLBACK_AVAILABILITIES;

  const lesionLabels = draft.lesionTypes
    ?.map((l) => {
      const label = lesionOptions.find((o) => o.code === l.code)?.labelFr ?? l.code;
      return l.precision ? `${label} (${l.precision})` : label;
    })
    .join(", ");
  const availabilityLabels = draft.availabilities
    ?.map((a) =>
      a.availabilityId
        ? (availabilityOptions.find((o) => o.id === a.availabilityId)?.label ?? "Créneau sélectionné")
        : (a.autrePrecision ?? "Autre disponibilité"),
    )
    .join(", ");

  const keptPhotos = photos.filter((p) => p.status === "uploaded" || p.status === "queued" || p.status === "uploading");
  const waitingPhotos = keptPhotos.filter((p) => p.status !== "uploaded").length;

  function editStep(step: Exclude<keyof ConsultationStackParamList, "Summary" | "Confirmation">) {
    navigation.navigate(step, { fromSummary: true });
  }

  // Les photos ne sont plus obligatoires (un problème de peau peut n'avoir aucune
  // lésion visible) — l'absence totale d'une vue ne doit donc pas forcer la mise
  // en file. Seule une photo réellement en cours d'envoi/en attente compte comme
  // "pas encore prête", pour choisir entre envoi immédiat et mise en file (voir
  // handleSubmit) — jamais pour bloquer le bouton : un agent terrain doit pouvoir
  // enchaîner ses dossiers sans connexion du tout, sur toute une tournée.
  const canSubmitNow = isOnline && photos.every((p) => p.status === "uploaded");

  function Section({
    title,
    onEdit,
    children,
  }: {
    title: string;
    onEdit: () => void;
    children: React.ReactNode;
  }) {
    return (
      <Card style={{ marginBottom: spacing.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm }}>
          <Text style={[typography.h2, { color: colors.text }]}>{title}</Text>
          <Pressable onPress={onEdit} hitSlop={8}>
            <Text style={[typography.label, { color: colors.accentStrong }]}>Modifier</Text>
          </Pressable>
        </View>
        {children}
      </Card>
    );
  }

  function Field({ label, value }: { label: string; value: string | undefined | null }) {
    if (!value) return null;
    return (
      <Text style={[typography.bodyMuted, { color: colors.textMuted, marginBottom: 4 }]}>
        <Text style={{ color: colors.text }}>{label} : </Text>
        {value}
      </Text>
    );
  }

  async function handleSubmit() {
    if (submitting) return;
    if (isDevPreview) {
      reset();
      navigation.reset({ index: 0, routes: [{ name: "Confirmation", params: { refNumber: 999999, mode } }] });
      return;
    }
    // Hors ligne, ou photos requises pas encore réellement reçues côté serveur :
    // on met l'envoi en file (voir services/offline/submitQueue.ts) et on
    // enchaîne immédiatement sur l'écran de confirmation plutôt que de bloquer
    // l'agent — syncEngine rejouera l'envoi automatiquement dès que possible,
    // exactement comme pour le brouillon/les photos/le consentement. Un vrai
    // numéro de dossier n'existe que côté serveur : il n'est donc connu qu'une
    // fois l'envoi réellement passé.
    // Dossier rempli sans aucune connexion : pas encore d'id serveur, il partira
    // avec son brouillon (voir submitQueue.ts#setSubmitConsultationId).
    if (!canSubmitNow || !consultationId) {
      queueSubmitLocally({ clientUuid, consultationId, mode });
      refreshPendingCount();
      reset();
      navigation.reset({ index: 0, routes: [{ name: "Confirmation", params: { refNumber: null, mode } }] });
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = mode === "agent" ? await submitWalkInConsultation(consultationId) : await submitConsultation(consultationId);
      reset();
      navigation.reset({ index: 0, routes: [{ name: "Confirmation", params: { refNumber: result.refNumber, mode } }] });
    } catch (err) {
      // Coupure détectée seulement maintenant (pas en amont par `canSubmitNow`,
      // ex. réseau tombé entre l'affichage de l'écran et l'appui sur le
      // bouton) : même traitement que le cas hors ligne plutôt qu'une erreur
      // bloquante — l'agent ne doit jamais être coincé sur cet écran.
      if (err instanceof ApiError && err.status === 0) {
        queueSubmitLocally({ clientUuid, consultationId, mode });
        refreshPendingCount();
        reset();
        navigation.reset({ index: 0, routes: [{ name: "Confirmation", params: { refNumber: null, mode } }] });
        return;
      }
      setError(err instanceof ApiError ? err.message : "Impossible d'envoyer votre demande. Réessayez.");
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.xxl }}>
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
          <Icon name="checkCircle" size={24} color={colors.accentStrong} strokeWidth={1.6} />
        </View>
        <Text style={[typography.h1, { color: colors.text, flex: 1 }]}>Vérifiez votre demande</Text>
      </View>

      <Section title="Informations personnelles" onEdit={() => editStep("Step1PersonalInfo")}>
        <Field label={mode === "agent" ? "Code du patient" : "Nom complet"} value={draft.nomComplet} />
        <Field label="Sexe" value={draft.sexe ? { M: "Masculin", F: "Féminin" }[draft.sexe] : undefined} />
        <Field label="Statut matrimonial" value={STATUT_OPTIONS.find((o) => o.value === draft.statutMatrimonial)?.label} />
        <Field label="Âge" value={withUnit(draft.age, "ans")} />
        <Field label="Date de naissance" value={isoDateToFr(draft.dateNaissance)} />
        <Field label="Ville" value={draft.ville} />
        <Field label="Profession" value={draft.profession} />
        <Field label="Téléphone" value={draft.telephoneContact} />
        <Field label="Email" value={draft.emailContact} />
        <Field label="Confirmation par WhatsApp" value={yesNo(draft.confirmationWhatsapp)} />
        <Field label="Poids" value={withUnit(draft.poidsKg, "kg")} />
        <Field label="Taille" value={withUnit(draft.tailleCm, "cm")} />
        <Field label="Température" value={withUnit(draft.temperatureC, "°C")} />
      </Section>

      <Section title="Votre problème" onEdit={() => editStep("Step2Problem")}>
        <Field label="Plainte" value={draft.motif} />
        <Field label="Conseil cosmétique demandé" value={yesNo(draft.conseilCosmetiqueDemande)} />
        <Field label="Précision du besoin" value={draft.conseilCosmetiquePrecision} />
        <Field
          label="Depuis"
          value={draft.dureeValeur && draft.dureeUnite ? `${draft.dureeValeur} ${DUREE_UNITE_LABELS[draft.dureeUnite]}` : undefined}
        />
        <Field
          label="Démangeaisons"
          value={draft.demangeaison ? { oui: "Oui", non: "Non", parfois: "Parfois", nuit: "Le soir ou la nuit" }[draft.demangeaison] : undefined}
        />
      </Section>

      <Section title="Aspect des lésions" onEdit={() => editStep("Step3LesionAspect")}>
        <Field label="Aspects sélectionnés" value={lesionLabels} />
        <Field
          label="Zones du corps"
          value={draft.lesionZones?.length ? draft.lesionZones.map((z) => BODY_ZONE_LABELS[z] ?? z).join(", ") : undefined}
        />
        <Field label="Autres localisations" value={draft.autresLesionsLocalisation} />
        <Field label="Premières lésions apparues à" value={draft.localisationPremieresLesions} />
        <Field label="Autres lésions" value={yesNo(draft.autresLesions)} />
        <Field label="Aspect des autres lésions" value={draft.autresLesionsAspect} />
        <Field label="Zones sensibles atteintes" value={yesNo(draft.zonesSensiblesAtteintes)} />
        <Field label="Précision zones sensibles" value={draft.zonesSensiblesPrecision} />
      </Section>

      <Section title="Contexte" onEdit={() => editStep("Step4Context")}>
        <Field
          label="Cas similaires dans l'entourage"
          value={draft.entourageStatus ? { oui: "Oui", non: "Non", ne_sait_pas: "Ne sait pas" }[draft.entourageStatus] : undefined}
        />
        <Field label="Précision entourage" value={draft.entouragePrecision} />
        <Field label="Produits ou traitements utilisés" value={yesNo(draft.produitsUtilises)} />
        <Field label="Précision produits" value={draft.produitsPrecision} />
        <Field label="Maladie chronique / traitement suivi" value={yesNo(draft.antecedentsMedicaux)} />
        <Field label="Précision antécédents" value={draft.antecedentsPrecision} />
        <Field label="Notes complémentaires" value={draft.notesComplementaires} />
      </Section>

      <Section title="Photos" onEdit={() => editStep("Photos")}>
        <Field label="Photos ajoutées" value={String(keptPhotos.length)} />
        {waitingPhotos > 0 ? <Field label="Dont en attente d'envoi" value={String(waitingPhotos)} /> : null}
        <Field label="Qualité confirmée" value={yesNo(draft.photosQualiteConfirmee)} />
        {keptPhotos.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
            {keptPhotos.map((p) => (
              <Image key={p.localUri} source={{ uri: p.localUri }} style={{ width: 72, height: 72, borderRadius: radius.md }} />
            ))}
          </View>
        ) : null}
      </Section>

      <Section title="Consentement & disponibilités" onEdit={() => editStep("ConsentAvailabilities")}>
        <Field label="Consentement donné" value={yesNo(consentGiven)} />
        <Field label="Disponibilités" value={availabilityLabels} />
      </Section>

      {!canSubmitNow ? (
        <Card style={{ backgroundColor: colors.accentSoft, borderColor: colors.accentSoft, marginTop: spacing.md }}>
          <Text style={[typography.bodyMuted, { color: colors.accentStrong }]}>
            {!isOnline
              ? "Vous êtes hors ligne — le dossier sera enregistré sur l'appareil et envoyé automatiquement dès le retour de la connexion. Vous pouvez continuer avec le patient suivant."
              : "Vos photos sont encore en cours d'envoi — le dossier sera transmis automatiquement dès qu'elles seront reçues. Vous pouvez continuer avec le patient suivant."}
          </Text>
        </Card>
      ) : null}

      {error ? (
        <Text style={[typography.bodyMuted, { color: colors.danger, marginTop: spacing.md, marginBottom: spacing.md }]}>
          {error}
        </Text>
      ) : null}

      <View style={{ marginTop: spacing.lg }}>
        <Button label={canSubmitNow ? "Envoyer ma demande" : "Enregistrer le dossier"} onPress={handleSubmit} loading={submitting} disabled={submitting} />
      </View>
    </ScreenContainer>
  );
}
