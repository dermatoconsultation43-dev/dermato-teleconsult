import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Text, View, type ImageSourcePropType } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { ChoiceGroup } from "../../components/ChoiceGroup";
import { StatusBadge } from "../../components/StatusBadge";
import { BODY_ZONE_LABELS } from "../../components/BodyMap";
import { useTheme } from "../../theme/useTheme";
import { useAuthStore } from "../../store/authStore";
import {
  adminPhotoViewPath,
  changeConsultationStatus,
  consultationPatientName,
  deleteConsultation,
  formatDossierNumber,
  getAdminConsultationDetail,
  saveConsultationConclusion,
  updateAppointment,
} from "../../services/api/admin";
import { getPhotoDataUri } from "../../services/api/photos";
import { getMockAdminConsultationDetail, updateMockConsultationStatus } from "../../services/devPreview/adminMock";
import { ApiError } from "../../services/api/client";
import type { AdminStackParamList } from "../../navigation/adminTypes";
import type { AdminConsultationDetail, ConsultationStatus, Photo, PhotoSlot } from "../../types/api";

type Props = NativeStackScreenProps<AdminStackParamList, "AdminConsultationDetail">;

const ALLOWED_TRANSITIONS: Record<ConsultationStatus, ConsultationStatus[]> = {
  draft: [],
  pending: ["confirmed", "cancelled"],
  confirmed: ["seen", "cancelled"],
  seen: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const SEXE_LABELS: Record<string, string> = { M: "Masculin", F: "Féminin" };
const STATUT_LABELS: Record<string, string> = {
  celibataire: "Célibataire",
  marie: "Marié(e)",
  vie_en_couple: "Vie en couple",
  veuf_veuve: "Veuf/Veuve",
  autre: "Autre",
};
const DEMANGEAISON_LABELS: Record<string, string> = {
  oui: "Oui",
  non: "Non",
  parfois: "Parfois",
  nuit: "Principalement le soir ou la nuit",
};
const ENTOURAGE_LABELS: Record<string, string> = { oui: "Oui", non: "Non", ne_sait_pas: "Je ne sais pas" };
const DUREE_UNITE_LABELS: Record<string, string> = { jours: "jour(s)", semaines: "semaine(s)", mois: "mois", annees: "année(s)" };
const PHOTO_SLOT_LABELS: Record<PhotoSlot, string> = {
  vue_generale: "Vue générale",
  vue_rapprochee: "Vue rapprochée",
  complementaire: "Photo complémentaire",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

// Accepte plusieurs formats courants plutôt que d'exiger l'ISO strict (2026-08-25T19:30) :
// "22/08/2026", "22/08/2026 19:30", "22-08-2026 19:30", en plus de l'ISO natif. Un
// admin qui tape une date à la main écrit naturellement en JJ/MM/AAAA, pas en ISO.
function parseFlexibleDate(text: string): Date | null {
  const trimmed = text.trim();
  const isoAttempt = new Date(trimmed);
  if (!Number.isNaN(isoAttempt.getTime())) return isoAttempt;

  const match = trimmed.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (!match) return null;
  const [, dayStr, monthStr, yearStr, hourStr, minuteStr] = match;
  const day = Number(dayStr);
  const month = Number(monthStr);
  const year = Number(yearStr);
  const hour = hourStr ? Number(hourStr) : 0;
  const minute = minuteStr ? Number(minuteStr) : 0;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const parsed = new Date(year, month - 1, day, hour, minute);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  const { colors, spacing, typography } = useTheme();
  if (!value) return null;
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[typography.body, { color: colors.text, marginTop: 2 }]}>{value}</Text>
    </View>
  );
}

function PhotoRow({
  consultationId,
  photo,
  mockSource,
}: {
  consultationId: string;
  photo: Photo;
  mockSource?: ImageSourcePropType;
}) {
  const { colors, spacing, radius, typography } = useTheme();
  // Data URI (pas { uri, headers } sur une URL distante) : avec la New
  // Architecture (newArchEnabled=true, voir android/gradle.properties), les
  // en-têtes passés à <Image> ne sont pas fiablement transmis au chargeur natif
  // sur Android — la requête part sans Authorization, le backend répond 401 en
  // JSON, et l'image échoue silencieusement au décodage (constaté en pratique,
  // systématique sur toutes les photos). On récupère donc les octets en JS
  // (en-tête fiable, comme le reste de l'API) et on les passe déjà décodés.
  const [source, setSource] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  async function reveal() {
    if (mockSource) {
      setRevealed(true);
      return;
    }
    setLoading(true);
    setError(null);
    setImageError(false);
    try {
      const dataUri = await getPhotoDataUri(adminPhotoViewPath(consultationId, photo.id));
      setSource(dataUri);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Impossible de charger la photo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={[typography.label, { color: colors.text, marginBottom: spacing.sm }]}>
        {PHOTO_SLOT_LABELS[photo.slot]}
      </Text>
      {revealed && mockSource ? (
        <Image
          source={mockSource}
          style={{ width: "100%", height: 240, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }}
          resizeMode="cover"
        />
      ) : source && !imageError ? (
        <Image
          source={{ uri: source }}
          style={{ width: "100%", height: 240, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }}
          resizeMode="cover"
          onError={() => setImageError(true)}
        />
      ) : imageError ? (
        <View>
          <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.xs }]}>
            Échec de l'affichage de la photo.
          </Text>
          <Button
            label="Réessayer"
            variant="secondary"
            onPress={() => {
              setSource(null);
              reveal();
            }}
          />
        </View>
      ) : photo.status !== "uploaded" ? (
        <Text style={[typography.bodyMuted, { color: colors.textMuted }]}>Photo non disponible ({photo.status}).</Text>
      ) : (
        <Button label={loading ? "Chargement…" : "Voir la photo"} variant="secondary" loading={loading} onPress={reveal} />
      )}
      {error ? <Text style={[typography.caption, { color: colors.danger, marginTop: spacing.xs }]}>{error}</Text> : null}
    </View>
  );
}

export function AdminConsultationDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const { colors, spacing, typography } = useTheme();
  const queryClient = useQueryClient();
  const isDevPreview = useAuthStore((s) => s.admin?.id === "dev-preview-admin");
  const [, forceMockRerender] = useState(0);

  const [actionMode, setActionMode] = useState<"confirm" | "cancel" | "edit-appointment" | "delete" | null>(null);
  const [selectedAvailabilityId, setSelectedAvailabilityId] = useState<string | null>(null);
  const [scheduledAtText, setScheduledAtText] = useState("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const [conclusionText, setConclusionText] = useState("");
  const [conclusionError, setConclusionError] = useState<string | null>(null);
  const conclusionInitializedFor = useRef<string | null>(null);

  // TS 5.0.4 (voir mobile/package.json) n'infère pas correctement le générique de
  // useQuery avec cette version de @tanstack/react-query — cast explicite pour éviter
  // que `data` ne retombe silencieusement en `any` (voir tsc --noEmit avant ce commit).
  const query = useQuery({
    queryKey: ["admin", "consultation", id],
    queryFn: () => getAdminConsultationDetail(id),
    enabled: !isDevPreview,
  });
  const mockConsultation = isDevPreview ? getMockAdminConsultationDetail(id) : undefined;
  const data = (isDevPreview ? mockConsultation : (query.data as AdminConsultationDetail | undefined));
  const photoSources = mockConsultation?.photoSources;
  const { isLoading, isError, refetch } = query;

  // Pré-remplit le champ conclusion une seule fois par dossier chargé (pas à chaque
  // refetch) — sinon une réponse serveur après un simple changement de statut
  // écraserait le texte en cours de frappe de l'admin.
  useEffect(() => {
    if (data && conclusionInitializedFor.current !== data.id) {
      setConclusionText(data.conclusionMedicale ?? "");
      conclusionInitializedFor.current = data.id;
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof changeConsultationStatus>[1]) =>
      isDevPreview ? Promise.resolve(updateMockConsultationStatus(id, input)) : changeConsultationStatus(id, input),
    onSuccess: () => {
      if (isDevPreview) {
        forceMockRerender((v) => v + 1);
      } else {
        queryClient.invalidateQueries({ queryKey: ["admin", "consultation", id] });
        queryClient.invalidateQueries({ queryKey: ["admin", "consultations"] });
        // Un changement de statut (ex. "terminé") change les compteurs de l'accueil
        // admin — sans ça, "Dossiers traités" reste sur sa valeur au premier
        // chargement de l'app tant que l'accueil n'est pas remonté (retour en
        // arrière ne suffit pas, voir AdminDashboardScreen.tsx).
        queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
      }
      setActionMode(null);
      setSelectedAvailabilityId(null);
      setScheduledAtText("");
      setNotes("");
      setReason("");
      setActionError(null);
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : "Une erreur est survenue.");
    },
  });

  const updateAppointmentMutation = useMutation({
    mutationFn: (input: Parameters<typeof updateAppointment>[1]) =>
      updateAppointment(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "consultation", id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "consultations"] });
      setActionMode(null);
      setSelectedAvailabilityId(null);
      setScheduledAtText("");
      setNotes("");
      setActionError(null);
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : "Une erreur est survenue lors de la modification.");
    },
  });

  const saveConclusionMutation = useMutation({
    mutationFn: (text: string) => saveConsultationConclusion(id, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "consultation", id] });
      setConclusionError(null);
      // L'enregistrement prend 2-3s (génération du PDF + envoi Drive) sans autre
      // retour visuel que la ligne "Dernier enregistrement" au-dessus du champ,
      // facile à manquer — d'où la confirmation explicite ici.
      Alert.alert("Enregistré", "La conclusion a été enregistrée et déposée dans le dossier Drive dédié.");
    },
    onError: (err) => {
      setConclusionError(err instanceof ApiError ? err.message : "Échec de l'enregistrement de la conclusion.");
    },
  });

  function handleSaveConclusion() {
    if (!conclusionText.trim()) {
      setConclusionError("La conclusion ne peut pas être vide.");
      return;
    }
    if (isDevPreview) {
      Alert.alert("Aperçu de démo", "L'enregistrement sur Drive n'est pas disponible en mode démo.");
      return;
    }
    setConclusionError(null);
    saveConclusionMutation.mutate(conclusionText.trim());
  }

  const deleteMutation = useMutation({
    mutationFn: (reason: string) =>
      deleteConsultation(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "consultations"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
      Alert.alert("Succès", "Dossier supprimé avec succès.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : "Une erreur est survenue lors de la suppression.");
    },
  });

  function handleDirectTransition(newStatus: ConsultationStatus, confirmLabel: string) {
    Alert.alert("Confirmer", confirmLabel, [
      { text: "Annuler", style: "cancel" },
      { text: "Confirmer", onPress: () => mutation.mutate({ newStatus }) },
    ]);
  }

  function handleConfirmSubmit() {
    if (!selectedAvailabilityId && !scheduledAtText.trim()) {
      setActionError("Sélectionnez un créneau ou indiquez une date/heure précise.");
      return;
    }
    let scheduledAt: string | undefined;
    if (scheduledAtText.trim()) {
      const parsed = parseFlexibleDate(scheduledAtText);
      if (!parsed) {
        setActionError("Date invalide. Exemple : 25/08/2026 19:30");
        return;
      }
      scheduledAt = parsed.toISOString();
    }
    setActionError(null);
    mutation.mutate({
      newStatus: "confirmed",
      availabilityId: selectedAvailabilityId ?? undefined,
      scheduledAt,
      notes: notes.trim() || undefined,
    });
  }

  function handleCancelSubmit() {
    setActionError(null);
    mutation.mutate({ newStatus: "cancelled", reason: reason.trim() || undefined });
  }

  function handleEditAppointmentSubmit() {
    if (!selectedAvailabilityId && !scheduledAtText.trim()) {
      setActionError("Sélectionnez un créneau ou indiquez une date/heure précise.");
      return;
    }
    let scheduledAt: string | undefined;
    if (scheduledAtText.trim()) {
      const parsed = parseFlexibleDate(scheduledAtText);
      if (!parsed) {
        setActionError("Date invalide. Exemple : 25/08/2026 19:30");
        return;
      }
      scheduledAt = parsed.toISOString();
    }
    setActionError(null);
    updateAppointmentMutation.mutate({
      availabilityId: selectedAvailabilityId ?? undefined,
      scheduledAt,
      notes: notes.trim() || undefined,
    });
  }

  function handleDeleteSubmit() {
    Alert.alert(
      "Confirmer la suppression",
      "Cette action ne peut pas être annulée. Êtes-vous sûr de vouloir supprimer ce dossier ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () => {
            deleteMutation.mutate(reason.trim() || "Suppression par l'administrateur");
          },
        },
      ],
    );
  }

  if (isLoading) {
    return (
      <ScreenContainer>
        <ActivityIndicator color={colors.accent} />
      </ScreenContainer>
    );
  }

  if (isError || !data) {
    return (
      <ScreenContainer>
        <Card>
          <Text style={[typography.body, { color: colors.text }]}>Impossible de charger ce dossier.</Text>
          <View style={{ marginTop: spacing.md }}>
            <Button label="Réessayer" variant="secondary" onPress={() => refetch()} />
          </View>
        </Card>
        <View style={{ marginTop: spacing.md }}>
          <Button label="Retour" variant="ghost" onPress={() => navigation.goBack()} />
        </View>
      </ScreenContainer>
    );
  }

  const consultation = data;
  const allowed = ALLOWED_TRANSITIONS[consultation.status];
  const availabilityOptions = consultation.availabilities
    .filter((a) => a.availability)
    .map((a) => ({ value: a.availability!.id, label: a.availability!.label }));

  return (
    <ScreenContainer>
      <Button label="← Retour à la liste" variant="ghost" fullWidth={false} onPress={() => navigation.goBack()} />

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.lg }}>
        <Text style={[typography.h1, { color: colors.text }]}>
          Dossier n°{formatDossierNumber(consultation.refNumber)}
        </Text>
        <StatusBadge status={consultation.status} />
      </View>
      <Text style={[typography.bodyMuted, { color: colors.textMuted, marginTop: 2 }]}>
        {consultationPatientName({ nomComplet: consultation.nomComplet ?? null, patient: consultation.patient })}
        {consultation.motif ? ` — ${consultation.motif}` : ""}
      </Text>

      {!isDevPreview ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md }}>
          <Button
            label={
              consultation.unreadMessagesCount > 0
                ? `Voir les messages (${consultation.unreadMessagesCount})`
                : "Voir les messages"
            }
            variant="secondary"
            fullWidth={false}
            onPress={() => navigation.navigate("AdminConsultationChat", { id: consultation.id })}
          />
        </View>
      ) : null}

      <Card style={{ marginTop: spacing.lg }}>
        <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.md }]}>Patient</Text>
        <InfoRow label="Nom complet (dossier)" value={consultation.nomComplet} />
        <InfoRow label="Nom du compte" value={`${consultation.patient.prenom} ${consultation.patient.nom}`} />
        <InfoRow label="Téléphone" value={consultation.patient.telephone} />
        <InfoRow label="Email" value={consultation.patient.email} />
        <InfoRow
          label="Confirmation par WhatsApp"
          value={consultation.confirmationWhatsapp === undefined ? undefined : consultation.confirmationWhatsapp ? "Oui" : "Non"}
        />
        <InfoRow label="Sexe" value={consultation.sexe ? SEXE_LABELS[consultation.sexe] : undefined} />
        <InfoRow label="Statut matrimonial" value={consultation.statutMatrimonial ? STATUT_LABELS[consultation.statutMatrimonial] : undefined} />
        <InfoRow label="Âge" value={consultation.age ? `${consultation.age} ans` : undefined} />
        <InfoRow label="Date de naissance" value={consultation.dateNaissance} />
        <InfoRow label="Ville" value={consultation.ville} />
        <InfoRow label="Profession" value={consultation.profession} />
        <InfoRow
          label="Constantes"
          value={
            [
              consultation.poidsKg ? `${consultation.poidsKg} kg` : null,
              consultation.tailleCm ? `${consultation.tailleCm} cm` : null,
              consultation.temperatureC ? `${consultation.temperatureC} °C` : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          }
        />
      </Card>

      <Card style={{ marginTop: spacing.lg }}>
        <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.md }]}>Motif et symptômes</Text>
        <InfoRow label="Motif" value={consultation.motif} />
        {consultation.conseilCosmetiqueDemande ? (
          <InfoRow label="Conseil cosmétique demandé" value={consultation.conseilCosmetiquePrecision ?? "Oui"} />
        ) : null}
        <InfoRow
          label="Durée"
          value={
            consultation.dureeValeur
              ? `${consultation.dureeValeur} ${consultation.dureeUnite ? DUREE_UNITE_LABELS[consultation.dureeUnite] : ""}`
              : undefined
          }
        />
        <InfoRow label="Localisation des premières lésions" value={consultation.localisationPremieresLesions} />
        <InfoRow
          label="Zones du corps touchées"
          value={consultation.lesionZones?.length ? consultation.lesionZones.map((z) => BODY_ZONE_LABELS[z] ?? z).join(", ") : undefined}
        />
        <InfoRow label="Démangeaisons" value={consultation.demangeaison ? DEMANGEAISON_LABELS[consultation.demangeaison] : undefined} />
        <InfoRow
          label="Aspect des lésions"
          value={
            consultation.lesionTypes.length > 0
              ? consultation.lesionTypes
                  .map((lt) => (lt.precision ? `${lt.lesionType.labelFr} (${lt.precision})` : lt.lesionType.labelFr))
                  .join(", ")
              : undefined
          }
        />
        {consultation.autresLesions ? (
          <InfoRow
            label="Autres lésions"
            value={[consultation.autresLesionsAspect, consultation.autresLesionsLocalisation].filter(Boolean).join(" — ") || "Oui"}
          />
        ) : null}
        {consultation.zonesSensiblesAtteintes ? (
          <InfoRow label="Zones sensibles atteintes" value={consultation.zonesSensiblesPrecision ?? "Oui"} />
        ) : null}
      </Card>

      <Card style={{ marginTop: spacing.lg }}>
        <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.md }]}>Entourage, produits, antécédents</Text>
        <InfoRow
          label="Entourage"
          value={consultation.entourageStatus ? ENTOURAGE_LABELS[consultation.entourageStatus] : undefined}
        />
        <InfoRow label="Précision entourage" value={consultation.entouragePrecision} />
        {consultation.produitsUtilises ? <InfoRow label="Produits utilisés" value={consultation.produitsPrecision ?? "Oui"} /> : null}
        {consultation.antecedentsMedicaux ? (
          <InfoRow label="Antécédents médicaux" value={consultation.antecedentsPrecision ?? "Oui"} />
        ) : null}
        <InfoRow label="Notes complémentaires" value={consultation.notesComplementaires} />
      </Card>

      {consultation.photos.length > 0 ? (
        <Card style={{ marginTop: spacing.lg }}>
          <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.md }]}>Photos</Text>
          {consultation.photos.map((photo) => (
            <PhotoRow key={photo.id} consultationId={consultation.id} photo={photo} mockSource={photoSources?.[photo.id]} />
          ))}
          <InfoRow
            label="Qualité confirmée par le patient"
            value={consultation.photosQualiteConfirmee === undefined ? undefined : consultation.photosQualiteConfirmee ? "Oui" : "Non"}
          />
        </Card>
      ) : null}

      <Card style={{ marginTop: spacing.lg }}>
        <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.md }]}>Disponibilités demandées</Text>
        {consultation.availabilities.length === 0 ? (
          <Text style={[typography.bodyMuted, { color: colors.textMuted }]}>Aucune.</Text>
        ) : (
          consultation.availabilities.map((a) => (
            <Text key={a.id} style={[typography.body, { color: colors.text, marginBottom: spacing.xs }]}>
              • {a.availability ? a.availability.label : `Autre : ${a.autrePrecision}`}
            </Text>
          ))
        )}
      </Card>

      {consultation.consent ? (
        <Card style={{ marginTop: spacing.lg }}>
          <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.md }]}>Consentement</Text>
          <InfoRow label="Version" value={consultation.consent.consentTextVersion} />
          <InfoRow label="Donné le" value={formatDate(consultation.consent.consentedAt)} />
        </Card>
      ) : null}

      {consultation.appointment ? (
        <Card style={{ marginTop: spacing.lg }}>
          <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.md }]}>Rendez-vous</Text>
          <InfoRow label="Créneau" value={consultation.appointment.availability?.label} />
          <InfoRow label="Date/heure" value={formatDate(consultation.appointment.scheduledAt)} />
          <InfoRow label="Notes" value={consultation.appointment.notes} />
        </Card>
      ) : null}

      {consultation.statusHistory.length > 0 ? (
        <Card style={{ marginTop: spacing.lg }}>
          <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.md }]}>Historique</Text>
          {consultation.statusHistory.map((h) => (
            <Text key={h.id} style={[typography.bodyMuted, { color: colors.textMuted, marginBottom: spacing.xs }]}>
              {formatDate(h.createdAt)} — {h.previousStatus ?? "création"} → {h.newStatus}
              {h.reason ? ` (${h.reason})` : ""}
            </Text>
          ))}
        </Card>
      ) : null}

      {consultation.status !== "draft" && consultation.status !== "pending" ? (
        <Card style={{ marginTop: spacing.lg }}>
          <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.xs }]}>Conclusion médicale</Text>
          <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.md }]}>
            Enregistrée en PDF dans le dossier Drive dédié aux réponses.
          </Text>
          {consultation.conclusionSavedAt ? (
            <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>
              Dernier enregistrement : {formatDate(consultation.conclusionSavedAt)}
            </Text>
          ) : null}
          <TextField
            label="Conclusion, diagnostic, recommandations…"
            value={conclusionText}
            onChangeText={setConclusionText}
            multiline
            numberOfLines={6}
            style={{ minHeight: 140, textAlignVertical: "top" }}
          />
          {conclusionError ? (
            <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.md }]}>{conclusionError}</Text>
          ) : null}
          {(() => {
            // Une fois enregistré, le bouton reflète cet état (désactivé, libellé
            // "Enregistré") tant que le texte n'a pas changé — sinon rien ne
            // distingue visuellement "vient d'être sauvegardé" de "pas encore
            // envoyé", alors même que la sauvegarde prend 2-3s (PDF + Drive).
            const isUnchanged =
              conclusionText.trim().length > 0 && conclusionText.trim() === (consultation.conclusionMedicale ?? "").trim();
            return (
              <Button
                label={isUnchanged && !saveConclusionMutation.isPending ? "Enregistré ✓" : "Enregistrer la réponse"}
                loading={saveConclusionMutation.isPending}
                disabled={isUnchanged}
                onPress={handleSaveConclusion}
              />
            );
          })()}
        </Card>
      ) : null}

      {allowed.length > 0 || consultation.status === "confirmed" ? (
        <Card style={{ marginTop: spacing.lg, marginBottom: spacing.xxl }}>
          <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.md }]}>Actions</Text>

          {actionMode === "confirm" ? (
            <View>
              {availabilityOptions.length > 0 ? (
                <>
                  <Text style={[typography.label, { color: colors.text, marginBottom: spacing.sm }]}>Choisir un créneau</Text>
                  <ChoiceGroup
                    options={availabilityOptions}
                    selected={selectedAvailabilityId ? [selectedAvailabilityId] : []}
                    onChange={([v]) => setSelectedAvailabilityId(v)}
                  />
                </>
              ) : null}
              <TextField
                label="Date/heure précise (optionnel, ex : 25/08/2026 19:30)"
                value={scheduledAtText}
                onChangeText={setScheduledAtText}
                style={{ marginTop: spacing.lg }}
              />
              <TextField label="Notes (optionnel)" value={notes} onChangeText={setNotes} />
              {actionError ? (
                <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.md }]}>{actionError}</Text>
              ) : null}
              <Button label="Valider la confirmation" loading={mutation.isPending} onPress={handleConfirmSubmit} />
              <View style={{ marginTop: spacing.sm }}>
                <Button label="Annuler" variant="ghost" onPress={() => setActionMode(null)} />
              </View>
            </View>
          ) : actionMode === "cancel" ? (
            <View>
              <TextField label="Motif de l'annulation (optionnel)" value={reason} onChangeText={setReason} />
              {actionError ? (
                <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.md }]}>{actionError}</Text>
              ) : null}
              <Button label="Confirmer l'annulation" loading={mutation.isPending} onPress={handleCancelSubmit} />
              <View style={{ marginTop: spacing.sm }}>
                <Button label="Retour" variant="ghost" onPress={() => setActionMode(null)} />
              </View>
            </View>
          ) : actionMode === "edit-appointment" ? (
            <View>
              {availabilityOptions.length > 0 ? (
                <>
                  <Text style={[typography.label, { color: colors.text, marginBottom: spacing.sm }]}>Choisir un créneau</Text>
                  <ChoiceGroup
                    options={availabilityOptions}
                    selected={selectedAvailabilityId ? [selectedAvailabilityId] : []}
                    onChange={([v]) => setSelectedAvailabilityId(v)}
                  />
                </>
              ) : null}
              <TextField
                label="Date/heure précise (optionnel, ex : 25/08/2026 19:30)"
                value={scheduledAtText}
                onChangeText={setScheduledAtText}
                style={{ marginTop: spacing.lg }}
              />
              <TextField label="Notes (optionnel)" value={notes} onChangeText={setNotes} />
              {actionError ? (
                <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.md }]}>{actionError}</Text>
              ) : null}
              <Button label="Modifier le rendez-vous" loading={updateAppointmentMutation.isPending} onPress={handleEditAppointmentSubmit} />
              <View style={{ marginTop: spacing.sm }}>
                <Button label="Annuler" variant="ghost" onPress={() => setActionMode(null)} />
              </View>
            </View>
          ) : actionMode === "delete" ? (
            <View>
              <TextField label="Motif de la suppression (optionnel)" value={reason} onChangeText={setReason} />
              {actionError ? (
                <Text style={[typography.caption, { color: colors.danger, marginBottom: spacing.md }]}>{actionError}</Text>
              ) : null}
              <Button
                label="Confirmer la suppression"
                loading={deleteMutation.isPending}
                onPress={handleDeleteSubmit}
                style={{ backgroundColor: colors.danger }}
              />
              <View style={{ marginTop: spacing.sm }}>
                <Button label="Annuler" variant="ghost" onPress={() => setActionMode(null)} />
              </View>
            </View>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {allowed.includes("confirmed") ? (
                <Button label="Confirmer le rendez-vous" onPress={() => setActionMode("confirm")} />
              ) : null}
              {consultation.status === "confirmed" ? (
                <Button label="Modifier le rendez-vous" onPress={() => {
                  setSelectedAvailabilityId(consultation.appointment?.availability?.id ?? null);
                  setScheduledAtText(consultation.appointment?.scheduledAt ? new Date(consultation.appointment.scheduledAt).toLocaleString("fr-FR") : "");
                  setNotes(consultation.appointment?.notes ?? "");
                  setActionMode("edit-appointment");
                }} />
              ) : null}
              {allowed.includes("seen") ? (
                <Button
                  label="Marquer comme vue"
                  onPress={() => handleDirectTransition("seen", "Marquer ce dossier comme vu ?")}
                />
              ) : null}
              {allowed.includes("completed") ? (
                <Button
                  label="Marquer comme terminée"
                  onPress={() => handleDirectTransition("completed", "Marquer cette consultation comme terminée ?")}
                />
              ) : null}
              {allowed.includes("cancelled") ? (
                <Button label="Annuler le dossier" variant="secondary" onPress={() => setActionMode("cancel")} />
              ) : null}
              {consultation.status !== "draft" && consultation.status !== "pending" ? (
                <Button
                  label="Supprimer le dossier"
                  variant="secondary"
                  onPress={() => {
                    setReason("");
                    setActionMode("delete");
                  }}
                  style={{ borderColor: colors.danger }}
                />
              ) : null}
            </View>
          )}
        </Card>
      ) : null}
    </ScreenContainer>
  );
}
