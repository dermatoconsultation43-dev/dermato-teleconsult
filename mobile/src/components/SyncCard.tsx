import React, { useCallback } from "react";
import { Text } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Button } from "./Button";
import { Card } from "./Card";
import { useManualSync } from "../hooks/useManualSync";
import { refreshPendingCount } from "../services/offline/syncEngine";
import { useTheme } from "../theme/useTheme";

// Carte de l'accueil agent : toujours visible, pour que l'agent sache ce qui reste
// à envoyer. Le compteur est relu à chaque retour sur l'écran, car les dossiers et
// photos mis en file pendant la saisie ne le mettent pas à jour eux-mêmes.
export function SyncCard() {
  const { colors, spacing, typography } = useTheme();
  const { syncNow, syncing, isOnline, pendingCount } = useManualSync();

  useFocusEffect(
    useCallback(() => {
      refreshPendingCount();
    }, []),
  );

  const status = !isOnline
    ? "Hors ligne : connectez-vous à internet pour synchroniser."
    : pendingCount > 0
      ? `${pendingCount} élément${pendingCount > 1 ? "s" : ""} en attente d'envoi.`
      : "Tout est envoyé.";

  return (
    <Card style={{ marginBottom: spacing.md }}>
      <Text style={[typography.label, { color: colors.accentStrong, letterSpacing: 0.6, marginBottom: spacing.sm }]}>
        SYNCHRONISATION
      </Text>
      <Text style={[typography.bodyMuted, { color: colors.textMuted, marginBottom: spacing.md }]}>{status}</Text>
      <Button label="Synchroniser maintenant" variant="secondary" onPress={syncNow} loading={syncing} disabled={!isOnline} />
    </Card>
  );
}
