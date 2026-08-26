import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { StatusBadge } from "../../components/StatusBadge";
import { Icon, IconName } from "../../components/icons/Icon";
import { useTheme } from "../../theme/useTheme";
import { useAuthStore } from "../../store/authStore";
import { useConsultationDraftStore } from "../../store/consultationDraftStore";
import { useOfflineStore } from "../../store/offlineStore";
import { listMyConsultations } from "../../services/api/consultations";
import { signOut } from "../../services/auth/firebaseAuth";
import type { ConsultationSummary } from "../../types/api";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "PatientDashboard">;

const OTHER_SERVICES: { label: string; subtitle: string; icon: IconName }[] = [
  { label: "Mes ordonnances", subtitle: "Retrouvez vos ordonnances", icon: "document" },
  { label: "Mes rendez-vous", subtitle: "Gérez vos rendez-vous", icon: "calendar" },
  { label: "Mon profil", subtitle: "Gérez vos informations", icon: "user" },
];

const TIPS = [
  { title: "Prenez soin de votre peau", body: "Découvrez des conseils et astuces pour une peau saine au quotidien." },
  { title: "Protégez-vous du soleil", body: "Une protection solaire adaptée limite le risque de lésions cutanées." },
  { title: "Hydratation quotidienne", body: "Une peau bien hydratée cicatrise et se régénère plus facilement." },
];

// Ces services n'ont pas encore d'écran dédié — plutôt qu'une navigation vers un
// écran inexistant (ou un item silencieusement inerte), on assume explicitement que
// ce n'est pas encore disponible.
function notifyComingSoon(label: string) {
  Alert.alert(label, "Cette fonctionnalité arrive prochainement.");
}

export function DashboardScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const { width } = useWindowDimensions();
  const patient = useAuthStore((s) => s.patient);
  const resetDraft = useConsultationDraftStore((s) => s.reset);
  const pendingCount = useOfflineStore((s) => s.pendingCount);
  const [tipIndex, setTipIndex] = useState(0);
  const tipsScrollRef = useRef<ScrollView>(null);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["consultations", "mine"],
    queryFn: () => listMyConsultations(),
  });

  const consultations = data?.items ?? [];
  // Déjà chargé par le useQuery ci-dessus (aucun appel réseau supplémentaire) —
  // sert à la fois au badge sur la cloche et au point rouge de la tuile "Mes
  // messages" (voir messages.service.ts côté backend pour le calcul par dossier).
  const unreadMessagesTotal = consultations.reduce((sum: number, item: ConsultationSummary) => sum + item.unreadMessagesCount, 0);
  const initial = (patient?.prenom?.[0] ?? "?").toUpperCase();
  const tipCardWidth = width - spacing.xxl * 2;

  function startNewConsultation() {
    resetDraft();
    navigation.navigate("NewConsultation");
  }

  function handleBellPress() {
    if (unreadMessagesTotal > 0) {
      navigation.navigate("MessagesList");
    } else if (pendingCount > 0) {
      Alert.alert(
        "Synchronisation en attente",
        `${pendingCount} brouillon${pendingCount > 1 ? "s" : ""} enregistré${pendingCount > 1 ? "s" : ""} sur cet appareil, en attente de synchronisation.`,
      );
    } else {
      Alert.alert("Notifications", "Aucune nouvelle notification.");
    }
  }

  function handleTipsScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setTipIndex(Math.round(event.nativeEvent.contentOffset.x / tipCardWidth));
  }

  function renderConsultation(item: ConsultationSummary) {
    // Un même compte (notamment un compte agent partagé, voir AgentNavigator)
    // peut enregistrer des dossiers pour des personnes différentes — le nom du
    // patient de CE dossier identifie donc mieux la liste que le numéro seul.
    const title = item.nomComplet?.trim() || `Dossier n°${String(item.refNumber).padStart(6, "0")}`;
    return (
      <Card key={item.id} style={{ marginBottom: spacing.md }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ flex: 1, marginRight: spacing.md }}>
            <Text style={[typography.h2, { color: colors.text }]} numberOfLines={1}>
              {title}
            </Text>
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
              Dossier n°{String(item.refNumber).padStart(6, "0")}
            </Text>
            <Text style={[typography.bodyMuted, { color: colors.textMuted, marginTop: spacing.xs }]} numberOfLines={2}>
              {item.motif ?? "Brouillon non complété"}
            </Text>
          </View>
          <StatusBadge status={item.status} />
        </View>
      </Card>
    );
  }

  return (
    <ScreenContainer scroll padded={false}>
      <View style={{ paddingHorizontal: spacing.xxl, paddingTop: spacing.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: colors.accentSoft,
              alignItems: "center",
              justifyContent: "center",
              marginRight: spacing.md,
            }}
          >
            <Text style={[typography.h2, { color: colors.accentStrong }]}>{initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.h1, { color: colors.text }]}>Bonjour, {patient?.prenom ?? ""}</Text>
            <Text style={[typography.bodyMuted, { color: colors.textMuted }]}>Comment allez-vous aujourd'hui ?</Text>
          </View>
          <Pressable
            onPress={handleBellPress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            style={{ padding: spacing.xs }}
          >
            <Icon name="bell" size={24} color={colors.text} />
            {unreadMessagesTotal > 0 || pendingCount > 0 ? (
              <View
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: unreadMessagesTotal > 0 ? colors.danger : colors.warn,
                }}
              />
            ) : null}
          </Pressable>
        </View>

        <Pressable onPress={startNewConsultation} style={{ marginTop: spacing.xl }}>
          <View
            style={{
              backgroundColor: colors.accent,
              borderRadius: radius.lg,
              padding: spacing.lg,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: "rgba(255,255,255,0.18)",
                alignItems: "center",
                justifyContent: "center",
                marginRight: spacing.md,
              }}
            >
              <Icon name="plus" size={22} color={colors.onAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[typography.h2, { color: colors.onAccent }]}>Nouvelle téléconsultation</Text>
              <Text style={[typography.bodyMuted, { color: "rgba(255,255,255,0.85)" }]}>Consultez un dermatologue maintenant</Text>
            </View>
            <Icon name="chevronRight" size={22} color={colors.onAccent} />
          </View>
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: spacing.xxl, marginTop: spacing.xxl }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
          <Text style={[typography.label, { color: colors.textMuted }]}>MES CONSULTATIONS</Text>
          {consultations.length > 0 ? (
            <Pressable onPress={() => refetch()} hitSlop={8} disabled={isRefetching}>
              {isRefetching ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={[typography.caption, { color: colors.accentStrong, fontWeight: "600" }]}>Actualiser</Text>
              )}
            </Pressable>
          ) : null}
        </View>

        {isLoading ? (
          <View style={{ paddingVertical: spacing.xxxl, alignItems: "center" }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : isError ? (
          <Card>
            <Text style={[typography.body, { color: colors.text, textAlign: "center" }]}>
              Impossible de charger vos consultations.
            </Text>
            <View style={{ marginTop: spacing.md }}>
              <Button label="Réessayer" variant="secondary" onPress={() => refetch()} />
            </View>
          </Card>
        ) : consultations.length === 0 ? (
          <Card style={{ backgroundColor: colors.surfaceAlt, borderColor: colors.surfaceAlt, alignItems: "center" }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: colors.surface,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: spacing.md,
              }}
            >
              <Icon name="folder" size={30} color={colors.accent} />
            </View>
            <Text style={[typography.h2, { color: colors.text }]}>Aucune consultation</Text>
            <Text style={[typography.bodyMuted, { color: colors.textMuted, textAlign: "center", marginTop: spacing.xs, marginBottom: spacing.lg }]}>
              Vous n'avez pas encore effectué de téléconsultation.
            </Text>
            <Button label="Créer une consultation" variant="secondary" fullWidth={false} onPress={startNewConsultation} />
          </Card>
        ) : (
          <>{consultations.map(renderConsultation)}</>
        )}
      </View>

      <View style={{ paddingHorizontal: spacing.xxl, marginTop: spacing.xxl }}>
        <Text style={[typography.label, { color: colors.textMuted, marginBottom: spacing.md }]}>SERVICES</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
          <Pressable onPress={() => navigation.navigate("MessagesList")} style={{ width: "48%", marginBottom: spacing.md }}>
            <Card style={{ alignItems: "center", paddingVertical: spacing.lg }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: colors.accentSoft,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: spacing.sm,
                }}
              >
                <Icon name="message" size={20} color={colors.accentStrong} />
                {unreadMessagesTotal > 0 ? (
                  <View
                    style={{
                      position: "absolute",
                      top: -2,
                      right: -2,
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: colors.danger,
                    }}
                  />
                ) : null}
              </View>
              <Text style={[typography.body, { color: colors.text, fontWeight: "600", textAlign: "center" }]}>
                Mes messages
              </Text>
              <Text style={[typography.caption, { color: colors.textMuted, textAlign: "center", marginTop: 2 }]}>
                Discutez avec le dermatologue
              </Text>
            </Card>
          </Pressable>
          {OTHER_SERVICES.map((service) => (
            <Pressable
              key={service.label}
              onPress={() => notifyComingSoon(service.label)}
              style={{ width: "48%", marginBottom: spacing.md }}
            >
              <Card style={{ alignItems: "center", paddingVertical: spacing.lg }}>
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: colors.accentSoft,
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: spacing.sm,
                  }}
                >
                  <Icon name={service.icon} size={20} color={colors.accentStrong} />
                </View>
                <Text style={[typography.body, { color: colors.text, fontWeight: "600", textAlign: "center" }]}>
                  {service.label}
                </Text>
                <Text style={[typography.caption, { color: colors.textMuted, textAlign: "center", marginTop: 2 }]}>
                  {service.subtitle}
                </Text>
              </Card>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ marginTop: spacing.xl }}>
        <Text style={[typography.label, { color: colors.textMuted, marginBottom: spacing.md, paddingHorizontal: spacing.xxl }]}>
          CONSEILS SANTÉ
        </Text>
        <ScrollView
          ref={tipsScrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleTipsScrollEnd}
          contentContainerStyle={{ paddingHorizontal: spacing.xxl }}
        >
          {TIPS.map((tip, i) => (
            <Card
              key={tip.title}
              style={{
                width: tipCardWidth,
                marginRight: i === TIPS.length - 1 ? 0 : spacing.md,
                backgroundColor: colors.accentSoft,
                borderColor: colors.accentSoft,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: colors.surface,
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: spacing.md,
                }}
              >
                <Icon name="bulb" size={20} color={colors.accentStrong} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typography.h2, { color: colors.text }]}>{tip.title}</Text>
                <Text style={[typography.bodyMuted, { color: colors.textMuted, marginTop: 2 }]}>{tip.body}</Text>
              </View>
            </Card>
          ))}
        </ScrollView>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: spacing.md }}>
          {TIPS.map((tip, i) => (
            <View
              key={tip.title}
              style={{
                width: i === tipIndex ? 16 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === tipIndex ? colors.accent : colors.border,
              }}
            />
          ))}
        </View>
      </View>

      <View style={{ paddingHorizontal: spacing.xxl, marginTop: spacing.xxl }}>
        <Card style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: colors.accentSoft,
              alignItems: "center",
              justifyContent: "center",
              marginRight: spacing.md,
            }}
          >
            <Icon name="shieldCheck" size={22} color={colors.accentStrong} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.h2, { color: colors.text }]}>Vos données sont sécurisées</Text>
            <Text style={[typography.bodyMuted, { color: colors.textMuted, marginTop: 2 }]}>
              Nous garantissons la confidentialité et la sécurité de vos informations.
            </Text>
          </View>
        </Card>
      </View>

      <View style={{ padding: spacing.xxl }}>
        <Button label="Se déconnecter" variant="ghost" onPress={() => signOut()} />
      </View>
    </ScreenContainer>
  );
}
