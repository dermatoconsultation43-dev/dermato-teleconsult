import React from "react";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "../theme/useTheme";
import { useManualSync } from "../hooks/useManualSync";

// Bannière globale (montée depuis ScreenContainer, donc visible sur tout
// écran) : seul indicateur dont dépendent tous les écrans pour prévenir
// l'utilisateur que ses réponses sont stockées sur l'appareil en attendant la
// connexion — voir useSaveDraftStep, qui alimente la file locale en silence.
export function OfflineBanner() {
  const { colors, spacing, typography } = useTheme();
  const { syncNow, syncing, isOnline, pendingCount } = useManualSync();

  if (isOnline && pendingCount === 0) return null;

  return (
    <View
      style={{
        backgroundColor: isOnline ? colors.accentSoft : colors.warnSoft,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.lg,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <Text style={[typography.caption, { flex: 1, color: isOnline ? colors.accentStrong : colors.warn, fontWeight: "600" }]}>
        {isOnline
          ? syncing
            ? `Synchronisation en cours… (${pendingCount} en attente)`
            : `${pendingCount} élément${pendingCount > 1 ? "s" : ""} en attente d'envoi`
          : "Vous êtes hors ligne — vos réponses sont enregistrées sur cet appareil et seront envoyées automatiquement dès le retour de la connexion."}
      </Text>
      {isOnline && !syncing ? (
        <Pressable onPress={syncNow} hitSlop={8} accessibilityRole="button" style={{ marginLeft: spacing.md }}>
          <Text style={[typography.caption, { color: colors.accentStrong, fontWeight: "800" }]}>Synchroniser</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
