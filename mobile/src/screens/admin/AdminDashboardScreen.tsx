import React from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Card } from "../../components/Card";
import { OfflineBanner } from "../../components/OfflineBanner";
import { Icon, IconName } from "../../components/icons/Icon";
import { StatusBadge } from "../../components/StatusBadge";
import { useTheme } from "../../theme/useTheme";
import { useAuthStore } from "../../store/authStore";
import { signOut } from "../../services/auth/firebaseAuth";
import { consultationPatientName, formatDossierNumber, getAdminStats, listAdminConsultations, type AdminStats } from "../../services/api/admin";
import { listMockAdminConsultations } from "../../services/devPreview/adminMock";
import type { AdminConsultationListItem } from "../../types/api";
import type { AdminStackParamList } from "../../navigation/adminTypes";

const LOGO_ICON = require("../../assets/brand/logo-icon.png");

type Props = NativeStackScreenProps<AdminStackParamList, "AdminList">;

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

// Approximation dev preview uniquement (voir listMockAdminConsultations) : le
// backend expose de vrais compteurs (GET /admin/stats) qui, eux, ne sont jamais
// tronqués par une pagination — voir getAdminStats plus bas.
function computeMockStats(items: AdminConsultationListItem[]): AdminStats {
  return {
    participants: new Set(items.map((i) => i.patient.telephone)).size,
    pending: items.filter((i) => i.status === "pending").length,
    completed: items.filter((i) => i.status === "completed").length,
    today: items.filter((i) => isToday(i.createdAt)).length,
  };
}

function formatRelativeTime(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Il y a ${diffH} h`;
  return `Il y a ${Math.floor(diffH / 24)} j`;
}

function formatToday(): string {
  const label = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function initialsOf(prenom?: string, nom?: string): string {
  return (`${prenom?.[0] ?? ""}${nom?.[0] ?? ""}`.toUpperCase() || "A").slice(0, 2);
}

function initialsFromFullName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function AdminDashboardScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography } = useTheme();
  const admin = useAuthStore((s) => s.admin);
  const isDevPreview = admin?.id === "dev-preview-admin";

  // Compteurs réels (jamais tronqués par la pagination de la liste) — voir
  // GET /admin/stats côté backend (admin.service.ts#getAdminStats).
  const statsQuery = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => getAdminStats(),
    enabled: !isDevPreview,
  });

  // Aperçu des 5 dossiers les plus récents seulement — le filtrage/recherche
  // complet vit sur l'écran "Tous les dossiers" (AdminConsultationsListScreen),
  // l'accueil ne fait qu'un survol.
  const recentQuery = useQuery({
    queryKey: ["admin", "consultations", "recent"],
    queryFn: () => listAdminConsultations({ limit: 5 }),
    enabled: !isDevPreview,
  });

  // Aperçu séparé (3 max) des dossiers en attente uniquement, pour la section
  // "Dossiers à traiter" — distinct de `recentQuery` (qui mélange tous les
  // statuts) pour ne jamais afficher une section vide alors que des dossiers en
  // attente existent bel et bien, juste hors des 5 plus récents.
  const pendingQuery = useQuery({
    queryKey: ["admin", "consultations", "pending", "preview"],
    queryFn: () => listAdminConsultations({ status: "pending", limit: 3 }),
    enabled: !isDevPreview,
  });

  const isLoading = isDevPreview ? false : statsQuery.isLoading || recentQuery.isLoading;
  const isError = isDevPreview ? false : statsQuery.isError || recentQuery.isError;
  function refetch() {
    statsQuery.refetch();
    recentQuery.refetch();
    pendingQuery.refetch();
  }
  const isRefetching = statsQuery.isRefetching || recentQuery.isRefetching || pendingQuery.isRefetching;

  const mockItems = isDevPreview ? listMockAdminConsultations() : [];
  const dashboardStats: AdminStats = isDevPreview ? computeMockStats(mockItems) : (statsQuery.data ?? { participants: 0, pending: 0, completed: 0, today: 0 });

  const recent = isDevPreview
    ? [...mockItems].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5)
    : (recentQuery.data?.items ?? []);

  const pendingPreview = isDevPreview
    ? mockItems.filter((i) => i.status === "pending").slice(0, 3)
    : (pendingQuery.data?.items ?? []);
  const isPendingLoading = isDevPreview ? false : pendingQuery.isLoading;
  const isPendingError = isDevPreview ? false : pendingQuery.isError;

  const stats: { icon: IconName; value: number; label: string; subtitle: string; tint: "accent" | "warn" }[] = [
    { icon: "calendar", value: dashboardStats.today, label: "Consultations", subtitle: "Aujourd'hui", tint: "accent" },
    { icon: "clock", value: dashboardStats.pending, label: "En attente", subtitle: "À traiter", tint: "warn" },
    { icon: "users", value: dashboardStats.participants, label: "Participants", subtitle: "Total inscrits", tint: "accent" },
    { icon: "checkCircle", value: dashboardStats.completed, label: "Dossiers traités", subtitle: "Total traités", tint: "accent" },
  ];

  const quickActions: { icon: IconName; label: string; onPress: () => void }[] = [
    { icon: "folder", label: "Dossiers", onPress: () => navigation.navigate("AdminConsultationsList", { initialFilter: "all" }) },
    { icon: "plus", label: "Nouveau", onPress: () => navigation.navigate("AgentFlow") },
  ];

  function handleMenuPress() {
    Alert.alert("Menu", undefined, [
      { text: "Se déconnecter", style: "destructive", onPress: () => signOut() },
      { text: "Annuler", style: "cancel" },
    ]);
  }

  function handleBellPress() {
    Alert.alert(
      "Notifications",
      dashboardStats.pending > 0
        ? `${dashboardStats.pending} dossier${dashboardStats.pending > 1 ? "s" : ""} en attente de traitement.`
        : "Aucune nouvelle notification.",
    );
  }

  function renderRecentItem(item: AdminConsultationListItem, index: number) {
    const name = consultationPatientName(item);
    return (
      <Pressable
        key={item.id}
        onPress={() => navigation.navigate("AdminConsultationDetail", { id: item.id })}
        style={[
          styles.recentRow,
          { paddingVertical: spacing.md, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.border },
        ]}
      >
        <View style={[styles.avatar, { backgroundColor: colors.accentSoft, marginRight: spacing.md }]}>
          <Text style={[typography.label, { color: colors.accentStrong }]}>{initialsFromFullName(name)}</Text>
        </View>
        <View style={{ flex: 1, marginRight: spacing.sm }}>
          <Text style={[typography.body, { color: colors.text, fontWeight: "700" }]}>{name}</Text>
          <Text style={[typography.bodyMuted, { color: colors.textMuted, marginTop: 2 }]} numberOfLines={1}>
            {item.motif ?? "Motif non renseigné"}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>N°{formatDossierNumber(item.refNumber)}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <StatusBadge status={item.status} />
            <Icon name="chevronRight" size={18} color={colors.textMuted} />
          </View>
          <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.sm }]}>
            {formatRelativeTime(item.createdAt)}
          </Text>
        </View>
      </Pressable>
    );
  }

  function renderPendingItem(item: AdminConsultationListItem, index: number) {
    return (
      <Pressable
        key={item.id}
        onPress={() => navigation.navigate("AdminConsultationDetail", { id: item.id })}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: spacing.md,
          borderTopWidth: index === 0 ? 0 : 1,
          borderTopColor: colors.border,
        }}
      >
        <View style={[styles.pendingIcon, { backgroundColor: colors.warnSoft }]}>
          <Icon name="clipboard" size={18} color={colors.warn} />
        </View>
        <View style={{ flex: 1, marginLeft: spacing.md, marginRight: spacing.sm }}>
          <Text numberOfLines={1} style={[typography.body, { color: colors.text, fontWeight: "700" }]}>
            {consultationPatientName(item)}
          </Text>
          <Text numberOfLines={1} style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
            {item.motif ?? "Motif non renseigné"}
          </Text>
        </View>
        <Text style={[typography.caption, { color: colors.textMuted }]}>{formatRelativeTime(item.createdAt)}</Text>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <OfflineBanner />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <View style={{ paddingHorizontal: spacing.xxl, paddingTop: spacing.lg }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Pressable
              onPress={handleMenuPress}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Menu"
              style={{ padding: spacing.xs, marginRight: spacing.sm }}
            >
              <Icon name="menu" size={22} color={colors.text} />
            </Pressable>

            <Image source={LOGO_ICON} resizeMode="contain" style={{ width: 26, height: 26, marginRight: spacing.xs }} />
            <Text style={[typography.label, { flexShrink: 1 }]} numberOfLines={1}>
              <Text style={{ color: colors.accentStrong, fontWeight: "800" }}>DERMA</Text>
              <Text style={{ color: colors.text, fontWeight: "800" }}>CONSULT</Text>
            </Text>

            <View style={{ flex: 1 }} />

            <Pressable onPress={handleBellPress} hitSlop={8} accessibilityRole="button" accessibilityLabel="Notifications" style={{ padding: spacing.xs }}>
              <Icon name="bell" size={22} color={colors.text} />
              {dashboardStats.pending > 0 ? <View style={[styles.dot, { backgroundColor: colors.warn }]} /> : null}
            </Pressable>

            <View style={[styles.avatar, styles.headerAvatar, { backgroundColor: colors.accentSoft, marginLeft: spacing.sm }]}>
              <Text style={[typography.label, { color: colors.accentStrong }]}>{initialsOf(admin?.prenom, admin?.nom)}</Text>
              <View style={[styles.onlineDot, { backgroundColor: colors.accent, borderColor: colors.bg }]} />
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: spacing.xl }}>
            <View style={{ flex: 1, flexShrink: 1, marginRight: spacing.sm }}>
              <Text style={typography.display}>
                <Text style={{ color: colors.text }}>Bonjour, </Text>
                <Text style={{ color: colors.accentStrong }}>{admin?.prenom ?? "Admin"}</Text>
                <Text> 👋</Text>
              </Text>
              <Text style={[typography.bodyMuted, { color: colors.textMuted, marginTop: 2 }]}>Voici un aperçu de votre activité</Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexShrink: 0,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: radius.pill,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
                marginTop: 2,
              }}
            >
              <Icon name="calendar" size={14} color={colors.accentStrong} />
              <Text style={[typography.caption, { color: colors.text, fontWeight: "600", marginLeft: spacing.xs }]}>{formatToday()}</Text>
            </View>
          </View>

          <View style={[styles.statsGrid, { marginTop: spacing.xl }]}>
            {stats.map((stat) => {
              const iconBg = stat.tint === "warn" ? colors.warnSoft : colors.accentSoft;
              const iconFg = stat.tint === "warn" ? colors.warn : colors.accentStrong;
              return (
                <Card key={stat.label} style={{ width: "48%", marginBottom: spacing.md }}>
                  <View style={[styles.statIcon, { backgroundColor: iconBg, marginBottom: spacing.md }]}>
                    <Icon name={stat.icon} size={20} color={iconFg} />
                  </View>
                  <Text style={[typography.display, { color: colors.text }]}>{isLoading ? "–" : stat.value}</Text>
                  <Text style={[typography.body, { color: colors.text, fontWeight: "700", marginTop: 2 }]}>{stat.label}</Text>
                  <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>{stat.subtitle}</Text>
                </Card>
              );
            })}
          </View>
        </View>

        <View style={{ paddingHorizontal: spacing.xxl, marginTop: spacing.md }}>
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[typography.label, { color: colors.accentStrong, letterSpacing: 0.6, flexShrink: 1, marginRight: spacing.sm }]}>
                CONSULTATIONS RÉCENTES
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, flexShrink: 0 }}>
                {isRefetching ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Pressable onPress={refetch} hitSlop={8}>
                    <Text style={[typography.label, { color: colors.accentStrong }]}>Actualiser</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => navigation.navigate("AdminConsultationsList", { initialFilter: "all" })}
                  hitSlop={8}
                  style={{ flexDirection: "row", alignItems: "center" }}
                >
                  <Text style={[typography.label, { color: colors.accentStrong }]}>Voir tout</Text>
                  <Icon name="arrowRight" size={14} color={colors.accentStrong} strokeWidth={2.2} />
                </Pressable>
              </View>
            </View>

            <View style={{ marginTop: spacing.sm }}>
              {isLoading ? (
                <View style={{ paddingVertical: spacing.xxl, alignItems: "center" }}>
                  <ActivityIndicator color={colors.accent} />
                </View>
              ) : isError ? (
                <View style={{ paddingVertical: spacing.lg, alignItems: "center" }}>
                  <Text style={[typography.bodyMuted, { color: colors.textMuted, marginBottom: spacing.sm }]}>
                    Impossible de charger les dossiers.
                  </Text>
                  <Pressable onPress={() => refetch()}>
                    <Text style={[typography.label, { color: colors.accentStrong }]}>Réessayer</Text>
                  </Pressable>
                </View>
              ) : recent.length === 0 ? (
                <Text style={[typography.bodyMuted, { color: colors.textMuted, paddingVertical: spacing.lg }]}>
                  Aucun dossier pour le moment.
                </Text>
              ) : (
                recent.map(renderRecentItem)
              )}
            </View>
          </Card>
        </View>

        <View style={{ paddingHorizontal: spacing.xxl, marginTop: spacing.xl }}>
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[typography.label, { color: colors.warn, letterSpacing: 0.6, flexShrink: 1, marginRight: spacing.sm }]}>
                DOSSIERS À TRAITER
              </Text>
              <Pressable
                onPress={() => navigation.navigate("AdminConsultationsList", { initialFilter: "pending" })}
                hitSlop={8}
                style={{ flexDirection: "row", alignItems: "center", flexShrink: 0 }}
              >
                <Text style={[typography.label, { color: colors.accentStrong }]}>Voir tout</Text>
                <Icon name="arrowRight" size={14} color={colors.accentStrong} strokeWidth={2.2} />
              </Pressable>
            </View>

            <View style={{ marginTop: spacing.sm }}>
              {isPendingLoading ? (
                <View style={{ paddingVertical: spacing.xl, alignItems: "center" }}>
                  <ActivityIndicator color={colors.accent} />
                </View>
              ) : isPendingError ? (
                <View style={{ paddingVertical: spacing.lg, alignItems: "center" }}>
                  <Text style={[typography.bodyMuted, { color: colors.textMuted, marginBottom: spacing.sm }]}>
                    Impossible de charger les dossiers en attente.
                  </Text>
                  <Pressable onPress={() => pendingQuery.refetch()}>
                    <Text style={[typography.label, { color: colors.accentStrong }]}>Réessayer</Text>
                  </Pressable>
                </View>
              ) : pendingPreview.length === 0 ? (
                <Text style={[typography.bodyMuted, { color: colors.textMuted, paddingVertical: spacing.lg }]}>
                  Aucun dossier en attente.
                </Text>
              ) : (
                pendingPreview.map(renderPendingItem)
              )}
            </View>
          </Card>
        </View>

        <View style={{ paddingHorizontal: spacing.xxl, marginTop: spacing.xl }}>
          <Card>
            <Text style={[typography.label, { color: colors.accentStrong, letterSpacing: 0.6, marginBottom: spacing.md }]}>
              ACTIONS RAPIDES
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {quickActions.map((action) => (
                <Pressable key={action.label} onPress={action.onPress} style={{ flex: 1 }}>
                  <View style={[styles.actionTile, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
                    <Icon name={action.icon} size={20} color={colors.accentStrong} />
                    <Text
                      numberOfLines={1}
                      style={[typography.caption, { color: colors.text, fontWeight: "700", textAlign: "center", marginTop: spacing.sm }]}
                    >
                      {action.label}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </Card>
        </View>
      </ScrollView>

      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <View style={[styles.tabItem, { backgroundColor: colors.accentSoft, borderRadius: radius.md }]}>
          <Icon name="home" size={20} color={colors.accentStrong} />
          <Text style={[typography.caption, { color: colors.accentStrong, fontWeight: "700", marginTop: 2 }]}>Accueil</Text>
        </View>
        <Pressable style={styles.tabItem} onPress={() => navigation.navigate("AdminConsultationsList", { initialFilter: "all" })}>
          <Icon name="folder" size={20} color={colors.textMuted} />
          <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>Dossiers</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  statsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  statIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  recentRow: { flexDirection: "row", alignItems: "flex-start" },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  headerAvatar: { width: 34, height: 34, borderRadius: 17 },
  onlineDot: { position: "absolute", right: -1, bottom: -1, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  dot: { position: "absolute", top: 4, right: 4, width: 8, height: 8, borderRadius: 4 },
  pendingIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  actionTile: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 76,
  },
  tabBar: { flexDirection: "row", borderTopWidth: 1, paddingTop: 8, paddingBottom: 8, paddingHorizontal: 4 },
  tabItem: { flex: 1, alignItems: "center", paddingVertical: 8, marginHorizontal: 2 },
});
