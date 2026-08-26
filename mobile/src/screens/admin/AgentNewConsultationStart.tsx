import React, { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { TextField } from "../../components/TextField";
import { Card } from "../../components/Card";
import { Icon } from "../../components/icons/Icon";
import { useTheme } from "../../theme/useTheme";
import { useConsultationDraftStore } from "../../store/consultationDraftStore";
import { signOut } from "../../services/auth/firebaseAuth";
import type { AgentStackParamList } from "../../navigation/agentTypes";

const LOGO_ICON = require("../../assets/brand/logo-icon.png");

type Props = NativeStackScreenProps<AgentStackParamList, "AgentNewConsultationStart">;

// Point d'entrée du "mode terrain" : un agent (ou un admin, voir AdminNavigator)
// saisit nom + téléphone pour démarrer un dossier au nom d'une personne qui n'a
// pas de compte. Ces deux champs ne déclenchent aucun appel réseau ici — ils sont
// simplement posés dans le brouillon (voir consultationDraftStore) et c'est le
// premier "Continuer" de Step1PersonalInfo qui crée réellement le patient et la
// consultation côté serveur (voir useSaveDraftStep +
// backend/src/modules/agent/agent.service.ts#createOrUpdateWalkInDraft). Les
// autres champs de Step1PersonalInfo restent à compléter normalement.
export function AgentNewConsultationStart({ navigation }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const resetDraft = useConsultationDraftStore((s) => s.reset);
  const setMode = useConsultationDraftStore((s) => s.setMode);
  const updateDraft = useConsultationDraftStore((s) => s.updateDraft);
  const [nomComplet, setNomComplet] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const canGoBack = navigation.canGoBack();

  function handleStart() {
    if (!nomComplet.trim()) {
      setError("Le nom complet est requis.");
      return;
    }
    setError(null);
    resetDraft();
    setMode("agent");
    updateDraft({ nomComplet: nomComplet.trim(), ...(email.trim() ? { emailContact: email.trim() } : {}) });
    navigation.navigate("AgentConsultation");
  }

  return (
    <ScreenContainer>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.xl }}>
        {canGoBack ? (
          <Pressable
            onPress={() => navigation.goBack()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Retour"
            style={{ width: 32 }}
          >
            <Icon name="arrowLeft" size={22} color={colors.accentStrong} />
          </Pressable>
        ) : (
          <View style={{ width: 32 }} />
        )}

        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
          <Image source={LOGO_ICON} resizeMode="contain" style={{ width: 34, height: 34, marginRight: spacing.sm }} />
          <View>
            <Text style={typography.h2}>
              <Text style={{ color: colors.accentStrong, fontWeight: "800" }}>DERMA</Text>
              <Text style={{ color: colors.text, fontWeight: "800" }}>CONSULT</Text>
            </Text>
            <Text style={[typography.caption, { color: colors.accentStrong, letterSpacing: 0.6, fontWeight: "600" }]}>
              TÉLÉCONSULTATION DERMATOLOGIQUE
            </Text>
          </View>
        </View>

        <View style={{ width: 32 }} />
      </View>

      <View style={{ alignItems: "center", marginBottom: spacing.xl }}>
        <View
          style={{
            width: 92,
            height: 92,
            borderRadius: 46,
            borderWidth: 1.5,
            borderStyle: "dashed",
            borderColor: colors.accent,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: spacing.lg,
          }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: colors.surface,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#000",
              shadowOpacity: 0.08,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            }}
          >
            <Icon name="plus" size={28} color={colors.accentStrong} />
          </View>
        </View>
        <Text style={[typography.h1, { color: colors.text, textAlign: "center" }]}>Nouveau dossier terrain</Text>
        <Text style={[typography.bodyMuted, { color: colors.textMuted, textAlign: "center", marginTop: spacing.xs }]}>
          Pour une personne présente avec vous, sans compte dans l'application.
        </Text>
      </View>

      <Card style={{ marginBottom: spacing.xl }}>
        <View style={{ flexDirection: "row" }}>
          <View style={[styles.fieldIcon, { backgroundColor: colors.accentSoft }]}>
            <Icon name="user" size={18} color={colors.accentStrong} />
          </View>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <TextField
              label="Nom complet *"
              placeholder="Saisissez le nom complet"
              value={nomComplet}
              onChangeText={setNomComplet}
            />
          </View>
        </View>

        <View style={{ height: 1, backgroundColor: colors.border, marginTop: -spacing.sm, marginBottom: spacing.xs }} />

        <View style={{ flexDirection: "row" }}>
          <View style={[styles.fieldIcon, { backgroundColor: colors.accentSoft }]}>
            <Icon name="mail" size={18} color={colors.accentStrong} />
          </View>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <TextField
              label="Adresse email"
              placeholder="Saisissez l'adresse email (facultatif)"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
        </View>
      </Card>

      {error ? (
        <Text style={[typography.bodyMuted, { color: colors.danger, marginBottom: spacing.md, textAlign: "center" }]}>{error}</Text>
      ) : null}

      <Pressable
        onPress={handleStart}
        accessibilityRole="button"
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.accentStrong,
          borderRadius: radius.pill,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.sm,
          marginBottom: spacing.xl,
        }}
      >
        <View style={[styles.startIcon, { backgroundColor: colors.surface }]}>
          <Icon name="arrowRight" size={18} color={colors.accentStrong} />
        </View>
        <Text style={[typography.body, { color: colors.onAccent, fontWeight: "700", flex: 1, textAlign: "center", marginRight: 36 }]}>
          Commencer le dossier
        </Text>
      </Pressable>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: spacing.xl }}>
        <Icon name="shieldCheck" size={16} color={colors.textMuted} />
        <Text style={[typography.caption, { color: colors.textMuted, marginLeft: spacing.xs }]}>
          Vos données sont sécurisées et confidentielles
        </Text>
      </View>

      <Pressable
        onPress={() => signOut()}
        accessibilityRole="button"
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.md,
          paddingVertical: spacing.md,
        }}
      >
        <Icon name="logout" size={18} color={colors.accentStrong} />
        <Text style={[typography.body, { color: colors.accentStrong, fontWeight: "600", marginLeft: spacing.sm }]}>Se déconnecter</Text>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = {
  fieldIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center" as const, justifyContent: "center" as const },
  startIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center" as const, justifyContent: "center" as const },
};
