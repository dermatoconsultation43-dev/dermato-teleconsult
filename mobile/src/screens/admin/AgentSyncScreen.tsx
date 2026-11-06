import React, { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useManualSync } from "../../hooks/useManualSync";
import { discardDossier, listPendingDossiers, type PendingDossier } from "../../services/offline/pendingDossiers";
import { refreshPendingCount } from "../../services/offline/syncEngine";
import { useOfflineStore } from "../../store/offlineStore";
import { useTheme } from "../../theme/useTheme";
import type { AgentStackParamList } from "../../navigation/agentTypes";

type Props = NativeStackScreenProps<AgentStackParamList, "AgentSync">;

function statusOf(dossier: PendingDossier): string {
  const photos = dossier.photoCount > 0 ? ` · ${dossier.photoCount} photo${dossier.photoCount > 1 ? "s" : ""}` : "";
  return `${dossier.readyToSend ? "Prêt à envoyer" : "Saisie non terminée"}${photos}`;
}

// Liste des dossiers restés sur ce téléphone. Un dossier envoyé disparaît de la
// liste ; un dossier refusé y affiche sa raison, pour que l'agent sache quoi faire.
export function AgentSyncScreen({ navigation }: Props) {
  const { colors, spacing, typography } = useTheme();
  const { isOnline, running, syncOne, syncEverything } = useManualSync();
  const queueRevision = useOfflineStore((s) => s.queueRevision);
  const [dossiers, setDossiers] = useState<PendingDossier[]>(() => listPendingDossiers());

  useEffect(() => {
    setDossiers(listPendingDossiers());
  }, [queueRevision]);

  function confirmDiscard(dossier: PendingDossier) {
    Alert.alert(
      "Retirer ce dossier ?",
      "Ce qui n'a pas été envoyé sera définitivement perdu sur ce téléphone.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Retirer",
          style: "destructive",
          onPress: () => {
            discardDossier(dossier.clientUuid);
            refreshPendingCount();
          },
        },
      ],
    );
  }

  return (
    <ScreenContainer>
      <Button label="← Retour" variant="ghost" fullWidth={false} onPress={() => navigation.goBack()} />
      <Text style={[typography.h1, { color: colors.text, marginTop: spacing.sm }]}>Dossiers à envoyer</Text>
      <Text style={[typography.bodyMuted, { color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.lg }]}>
        {isOnline
          ? "Ces dossiers sont encore sur ce téléphone. Appuyez sur Synchroniser pour les envoyer."
          : "Pas de connexion : connectez-vous à internet pour envoyer ces dossiers."}
      </Text>

      {dossiers.length === 0 ? (
        <Card>
          <Text style={[typography.body, { color: colors.text }]}>Tous les dossiers sont envoyés.</Text>
        </Card>
      ) : null}

      {dossiers.length > 1 ? (
        <View style={{ marginBottom: spacing.lg }}>
          <Button
            label="Tout synchroniser"
            onPress={syncEverything}
            loading={running === "all"}
            disabled={!isOnline || running !== null}
          />
        </View>
      ) : null}

      {dossiers.map((dossier) => (
        <Card key={dossier.clientUuid} style={{ marginBottom: spacing.md }}>
          <Text style={[typography.body, { color: colors.text, fontWeight: "700" }]}>{dossier.label ?? "Dossier sans code"}</Text>
          <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>{statusOf(dossier)}</Text>
          {dossier.error ? (
            <Text style={[typography.bodyMuted, { color: colors.danger, marginTop: spacing.sm }]}>{dossier.error}</Text>
          ) : null}
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            <Button
              label={dossier.error ? "Réessayer" : "Synchroniser"}
              variant="secondary"
              onPress={() => syncOne(dossier.clientUuid)}
              loading={running === dossier.clientUuid}
              disabled={!isOnline || running !== null}
            />
            {dossier.error ? <Button label="Retirer ce dossier" variant="ghost" onPress={() => confirmDiscard(dossier)} /> : null}
          </View>
        </Card>
      ))}
    </ScreenContainer>
  );
}
