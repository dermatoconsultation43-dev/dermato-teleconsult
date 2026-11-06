import React from "react";
import { Text, View } from "react-native";
import { useTheme } from "../theme/useTheme";
import { useAuthStore } from "../store/authStore";
import { useOfflineStore } from "../store/offlineStore";

// Bannière globale (montée depuis ScreenContainer, donc visible sur tout
// écran) : seul indicateur dont dépendent tous les écrans pour prévenir
// l'utilisateur que ses réponses sont stockées sur l'appareil en attendant la
// connexion — voir useSaveDraftStep, qui alimente la file locale en silence.
export function OfflineBanner() {
  const { colors, spacing, typography } = useTheme();
  const isOnline = useOfflineStore((s) => s.isOnline);
  const pendingCount = useOfflineStore((s) => s.pendingCount);
  const isAdmin = useAuthStore((s) => s.admin?.role) === "admin";

  // La synchronisation concerne le terrain : un administrateur connecté n'a pas à
  // voir ce compteur. L'envoi automatique continue pour lui comme pour les autres.
  if (isOnline && (pendingCount === 0 || isAdmin)) return null;

  return (
    <View
      style={{
        backgroundColor: isOnline ? colors.accentSoft : colors.warnSoft,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.lg,
      }}
    >
      <Text style={[typography.caption, { color: isOnline ? colors.accentStrong : colors.warn, fontWeight: "600" }]}>
        {isOnline
          ? `${pendingCount} dossier${pendingCount > 1 ? "s" : ""} en attente d'envoi`
          : "Vous êtes hors ligne — vos réponses sont enregistrées sur cet appareil et seront envoyées automatiquement dès le retour de la connexion."}
      </Text>
    </View>
  );
}
