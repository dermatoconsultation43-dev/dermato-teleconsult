import React, { useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { launchCamera, launchImageLibrary, type Asset } from "react-native-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StepScreen } from "./components/StepScreen";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { ChoiceGroup } from "../../components/ChoiceGroup";
import { Icon } from "../../components/icons/Icon";
import { useTheme } from "../../theme/useTheme";
import { useConsultationDraftStore, type LocalPhoto } from "../../store/consultationDraftStore";
import { useOfflineStore } from "../../store/offlineStore";
import { useIsDevPreview } from "../../hooks/useIsDevPreview";
import { uploadPhoto } from "../../services/api/photos";
import { uploadWalkInPhoto } from "../../services/api/agent";
import { queuePhotoLocally, removeQueuedPhotoByLocalUri } from "../../services/offline/photoQueue";
import { ApiError } from "../../services/api/client";
import { CONSULTATION_TOTAL_STEPS, type ConsultationStackParamList } from "../../navigation/consultationTypes";
import type { PhotoSlot } from "../../types/api";

type Props = NativeStackScreenProps<ConsultationStackParamList, "Photos">;

const SLOTS: Array<{ slot: PhotoSlot; title: string }> = [
  { slot: "vue_generale", title: "Vue générale" },
  { slot: "vue_rapprochee", title: "Vue rapprochée" },
  { slot: "complementaire", title: "Photo supplémentaire" },
];

const TIPS = [
  "Utilisez un bon éclairage, de préférence la lumière du jour.",
  "Évitez les photos floues — tenez le téléphone stable.",
  "Si possible, utilisez un fond uni derrière la lésion.",
  "N'utilisez aucun filtre ni retouche.",
  "Faites une photo d'ensemble, puis une photo rapprochée nette.",
];

function mapPickerError(errorCode: string | undefined, errorMessage: string | undefined): string {
  switch (errorCode) {
    case "camera_unavailable":
      return "Caméra indisponible sur cet appareil. Essayez « Choisir depuis la galerie ».";
    case "permission":
      return "Autorisation refusée. Activez l'accès à la caméra ou aux photos dans les réglages.";
    default:
      // "others" ne donne pas de détail exploitable via errorCode seul — on relaie le
      // message brut de la librairie (utile pour diagnostiquer sur un appareil précis,
      // ex. absence d'application caméra sur certaines tablettes/box Android).
      return errorMessage
        ? `Impossible de récupérer la photo (${errorMessage}). Essayez « Choisir depuis la galerie ».`
        : "Impossible de récupérer la photo. Essayez « Choisir depuis la galerie ».";
  }
}

export function PhotosScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const mode = useConsultationDraftStore((s) => s.mode);
  const clientUuid = useConsultationDraftStore((s) => s.clientUuid);
  const consultationId = useConsultationDraftStore((s) => s.consultationId);
  const photos = useConsultationDraftStore((s) => s.photos);
  const setPhoto = useConsultationDraftStore((s) => s.setPhoto);
  const removePhoto = useConsultationDraftStore((s) => s.removePhoto);
  const draft = useConsultationDraftStore((s) => s.draft);
  const updateDraft = useConsultationDraftStore((s) => s.updateDraft);
  const isOnline = useOfflineStore((s) => s.isOnline);
  const isDevPreview = useIsDevPreview();
  const [stepError, setStepError] = useState<string | null>(null);

  async function pickAndUpload(slot: PhotoSlot, source: "camera" | "library") {
    // qualité 1 (brut, souvent 8-15 Mo sur un smartphone récent) rendait l'envoi
    // très lent, en particulier sur une connexion terrain modeste — 0.7 avec un
    // plafond de résolution donne des fichiers de quelques centaines de Ko à ~1-2
    // Mo, largement suffisant pour l'examen d'une lésion cutanée par le dermatologue.
    const options = {
      mediaType: "photo" as const,
      quality: 0.7 as const,
      maxWidth: 1600,
      maxHeight: 1600,
      saveToPhotos: false,
    };
    const result = source === "camera" ? await launchCamera(options) : await launchImageLibrary(options);

    if (result.didCancel) return;
    if (result.errorCode) {
      setStepError(mapPickerError(result.errorCode, result.errorMessage));
      return;
    }

    const asset: Asset | undefined = result.assets?.[0];
    if (!asset?.uri) return;

    const mimeType = asset.type ?? "image/jpeg";
    const sizeBytes = asset.fileSize ?? 0;
    const localUri = asset.uri;

    if (isDevPreview) {
      setPhoto({ slot, localUri, photoId: "dev-preview", status: "uploaded" });
      return;
    }

    // Hors ligne, ou dossier pas encore synchronisé (pas encore d'id serveur) :
    // on met la photo en file locale tout de suite (voir services/offline/
    // photoQueue.ts) plutôt que de bloquer — syncEngine l'enverra automatiquement
    // dès que possible, comme pour le reste du formulaire.
    if (!isOnline || !consultationId) {
      queuePhotoLocally({ clientUuid, consultationId, mode, slot, localUri, mimeType, sizeBytes });
      setPhoto({ slot, localUri, photoId: null, status: "queued" });
      return;
    }

    setPhoto({ slot, localUri, photoId: null, status: "uploading" });

    try {
      const photo =
        mode === "agent"
          ? await uploadWalkInPhoto(consultationId, { slot, localUri, mimeType })
          : await uploadPhoto(consultationId, { slot, localUri, mimeType });
      setPhoto({ slot, localUri, photoId: photo.id, status: "uploaded" });
    } catch (err) {
      // Échec réseau (pas juste "hors ligne" détecté en amont, ex. coupure en
      // plein envoi) : on la met quand même en file plutôt que de forcer
      // l'utilisateur à relancer manuellement — voir status 0 = network_error
      // dans services/api/client.ts.
      if (err instanceof ApiError && err.status === 0) {
        queuePhotoLocally({ clientUuid, consultationId, mode, slot, localUri, mimeType, sizeBytes });
        setPhoto({ slot, localUri, photoId: null, status: "queued" });
        return;
      }
      setPhoto({
        slot,
        localUri,
        photoId: null,
        status: "error",
        errorMessage: err instanceof ApiError ? err.message : "Envoi de la photo échoué. Réessayez.",
      });
    }
  }

  function handleRemove(photo: LocalPhoto) {
    removePhoto(photo.slot, photo.localUri);
    removeQueuedPhotoByLocalUri(clientUuid, photo.slot, photo.localUri);
  }

  function renderSlotPhotos(slot: PhotoSlot) {
    return photos.filter((p) => p.slot === slot);
  }

  // Un problème de peau peut exister sans lésion visible à photographier (ex.
  // démangeaison seule) — les photos ne sont donc plus obligatoires pour avancer.
  // La question de qualité ne se pose que s'il y a au moins une photo à juger.
  const hasAnyPhoto = photos.some((p) => p.status === "uploaded" || p.status === "queued" || p.status === "uploading");
  const canContinue = !hasAnyPhoto || draft.photosQualiteConfirmee === true;

  function handleContinue() {
    if (hasAnyPhoto && draft.photosQualiteConfirmee !== true) {
      setStepError("Confirmez que vos photos sont nettes et de bonne qualité avant de continuer.");
      return;
    }
    setStepError(null);
    navigation.navigate("ConsentAvailabilities");
  }

  return (
    <StepScreen
      step={5}
      totalSteps={CONSULTATION_TOTAL_STEPS}
      title="Photos de la lésion"
      icon="camera"
      onBack={() => navigation.goBack()}
      onContinue={handleContinue}
      canContinue={canContinue}
      error={stepError}
    >
      <Card style={{ backgroundColor: colors.accentSoft, borderColor: colors.accentSoft, marginBottom: spacing.xl }}>
        {TIPS.map((tip) => (
          <Text key={tip} style={[typography.bodyMuted, { color: colors.accentStrong, marginBottom: 4 }]}>
            • {tip}
          </Text>
        ))}
      </Card>

      {SLOTS.map(({ slot, title }) => {
        const slotPhotos = renderSlotPhotos(slot);
        return (
          <View key={slot} style={{ marginBottom: spacing.xxl }}>
            <Text style={[typography.label, { color: colors.text, marginBottom: spacing.sm }]}>{title}</Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm }}>
              {slotPhotos.map((photo) => (
                <View key={photo.localUri} style={{ width: 96 }}>
                  <View style={[styles.thumbWrap, { borderRadius: radius.md, borderColor: colors.border }]}>
                    <Image source={{ uri: photo.localUri }} style={styles.thumb} />
                    {photo.status === "uploading" ? (
                      <View style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.35)" }]}>
                        <ActivityIndicator color="#FFFFFF" />
                      </View>
                    ) : null}
                    {photo.status === "queued" ? (
                      <View style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.35)" }]}>
                        <Icon name="clock" size={20} color="#FFFFFF" />
                      </View>
                    ) : null}
                    {photo.status === "error" ? (
                      <View style={[styles.overlay, { backgroundColor: colors.dangerSoft }]}>
                        <Text style={[typography.caption, { color: colors.danger, textAlign: "center" }]}>Échec</Text>
                      </View>
                    ) : null}
                  </View>
                  {photo.status === "queued" ? (
                    <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]} numberOfLines={2}>
                      En attente de connexion
                    </Text>
                  ) : null}
                  {photo.status === "error" && photo.errorMessage ? (
                    <Text style={[typography.caption, { color: colors.danger, marginTop: 4 }]} numberOfLines={3}>
                      {photo.errorMessage}
                    </Text>
                  ) : null}
                  <Pressable onPress={() => handleRemove(photo)} hitSlop={8}>
                    <Text style={[typography.caption, { color: colors.danger, marginTop: 4, textAlign: "center" }]}>
                      Supprimer
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>

            {slot === "complementaire" ||
            slotPhotos.length === 0 ||
            slotPhotos.every((p) => p.status === "error") ? (
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Button label="Prendre une photo" variant="secondary" fullWidth={false} onPress={() => pickAndUpload(slot, "camera")} />
                <Button
                  label="Choisir depuis la galerie"
                  variant="secondary"
                  fullWidth={false}
                  onPress={() => pickAndUpload(slot, "library")}
                />
              </View>
            ) : null}

          </View>
        );
      })}

      {hasAnyPhoto ? (
        <>
          <Text style={[typography.label, { color: colors.text, marginBottom: spacing.sm }]}>
            Vos photos sont-elles nettes et de bonne qualité ? *
          </Text>
          <ChoiceGroup
            options={[
              { value: "oui", label: "Oui" },
              { value: "non", label: "Non" },
            ]}
            selected={draft.photosQualiteConfirmee === undefined ? [] : [draft.photosQualiteConfirmee ? "oui" : "non"]}
            onChange={([value]) => updateDraft({ photosQualiteConfirmee: value === "oui" })}
          />
        </>
      ) : null}
    </StepScreen>
  );
}

const styles = StyleSheet.create({
  thumbWrap: { width: 96, height: 96, borderWidth: 1, overflow: "hidden" },
  thumb: { width: "100%", height: "100%" },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
});
