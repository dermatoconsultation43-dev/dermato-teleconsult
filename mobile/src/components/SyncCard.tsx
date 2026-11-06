import React, { useCallback } from "react";
import { Text } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Button } from "./Button";
import { Card } from "./Card";
import { refreshPendingCount } from "../services/offline/syncEngine";
import { useOfflineStore } from "../store/offlineStore";
import { useTheme } from "../theme/useTheme";

// Carte de l'écran d'arrivée des agents (AgentNewConsultationStart) : ouvre la
// liste des dossiers à envoyer. Le compteur est relu à chaque retour sur l'écran.
export function SyncCard({ onOpen }: { onOpen: () => void }) {
  const { colors, spacing, typography } = useTheme();
  const pendingCount = useOfflineStore((s) => s.pendingCount);

  useFocusEffect(
    useCallback(() => {
      refreshPendingCount();
    }, []),
  );

  return (
    <Card style={{ marginBottom: spacing.xl }}>
      <Text style={[typography.label, { color: colors.accentStrong, letterSpacing: 0.6, marginBottom: spacing.sm }]}>
        SYNCHRONISATION
      </Text>
      <Text style={[typography.bodyMuted, { color: colors.textMuted, marginBottom: pendingCount > 0 ? spacing.md : 0 }]}>
        {pendingCount > 0
          ? `${pendingCount} dossier${pendingCount > 1 ? "s" : ""} à envoyer.`
          : "Tous les dossiers sont envoyés."}
      </Text>
      {pendingCount > 0 ? <Button label="Voir les dossiers à envoyer" variant="secondary" onPress={onOpen} /> : null}
    </Card>
  );
}
