import React, { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { StatusBadge } from "../../components/StatusBadge";
import { useTheme } from "../../theme/useTheme";
import { useAuthStore } from "../../store/authStore";
import { consultationPatientName, consultationPatientPhone, formatDossierNumber, listAdminConsultations } from "../../services/api/admin";
import { listMockAdminConsultations } from "../../services/devPreview/adminMock";
import type { AdminConsultationListItem, ConsultationStatus } from "../../types/api";
import type { AdminStackParamList } from "../../navigation/adminTypes";

type Props = NativeStackScreenProps<AdminStackParamList, "AdminConsultationsList">;

const FILTERS: Array<{ value: ConsultationStatus | "all"; label: string }> = [
  { value: "pending", label: "En attente" },
  { value: "confirmed", label: "Confirmées" },
  { value: "seen", label: "Vues" },
  { value: "completed", label: "Terminées" },
  { value: "cancelled", label: "Annulées" },
  { value: "all", label: "Toutes" },
];

// Écran "Tous les dossiers" : recherche + filtres par statut. Accessible depuis
// l'accueil admin ("Voir tout", les actions rapides, l'onglet Dossiers) — c'est le
// même outil de travail au quotidien, juste séparé de l'accueil qui, lui, ne montre
// qu'un aperçu (statistiques + 5 dossiers récents).
export function AdminConsultationsListScreen({ navigation, route }: Props) {
  const { colors, spacing, typography, radius } = useTheme();
  const admin = useAuthStore((s) => s.admin);
  const isDevPreview = admin?.id === "dev-preview-admin";
  const [filter, setFilter] = useState<ConsultationStatus | "all">(route.params?.initialFilter ?? "all");
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["admin", "consultations", filter, search],
    queryFn: () => listAdminConsultations({ status: filter === "all" ? undefined : filter, search: search || undefined }),
    enabled: !isDevPreview,
  });

  const items = isDevPreview
    ? listMockAdminConsultations(filter === "all" ? undefined : filter, search || undefined)
    : (data?.items ?? []);

  const getErrorMessage = () => {
    if (!error) return "Une erreur est survenue lors du chargement des dossiers.";
    
    const err = error as any;
    if (err.message?.includes("network") || err.message?.includes("fetch")) {
      return "Erreur réseau. Vérifiez votre connexion internet.";
    }
    if (err.status === 401 || err.status === 403) {
      return "Vous n'avez pas l'accès pour voir les dossiers.";
    }
    if (err.status === 404) {
      return "Aucun dossier trouvé.";
    }
    if (err.message) {
      return `Erreur : ${err.message}`;
    }
    return "Impossible de charger les dossiers. Veuillez réessayer.";
  };

  function renderItem({ item }: { item: AdminConsultationListItem }) {
    return (
      <Pressable onPress={() => navigation.navigate("AdminConsultationDetail", { id: item.id })}>
        <Card style={{ marginBottom: spacing.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1, marginRight: spacing.md }}>
              <Text style={[typography.h2, { color: colors.text }]}>{consultationPatientName(item)}</Text>
              <Text style={[typography.bodyMuted, { color: colors.textMuted, marginTop: spacing.xs }]} numberOfLines={2}>
                {item.motif ?? "Motif non renseigné"}
              </Text>
              <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xs }]}>
                Dossier n°{formatDossierNumber(item.refNumber)} · {consultationPatientPhone(item)}
              </Text>
            </View>
            <StatusBadge status={item.status} />
          </View>
        </Card>
      </Pressable>
    );
  }

  return (
    <ScreenContainer scroll={false} padded={false}>
      <View style={{ padding: spacing.xxl, paddingBottom: spacing.lg }}>
        <Button label="← Retour" variant="ghost" fullWidth={false} onPress={() => navigation.goBack()} />

        <Text style={[typography.h1, { color: colors.text, marginTop: spacing.sm }]}>Tous les dossiers</Text>

        <TextField
          label="Rechercher un patient"
          icon="search"
          placeholder="Nom, prénom ou téléphone"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          style={{ marginTop: spacing.lg, marginBottom: 0 }}
        />
      </View>

      <View style={{ paddingHorizontal: spacing.xxl, marginBottom: spacing.md }}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={FILTERS}
          keyExtractor={(f) => f.value}
          contentContainerStyle={{ gap: spacing.sm }}
          renderItem={({ item: f }) => {
            const isActive = f.value === filter;
            return (
              <Pressable
                onPress={() => setFilter(f.value)}
                style={{
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.sm,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: isActive ? colors.accent : colors.border,
                  backgroundColor: isActive ? colors.accent : colors.surface,
                }}
              >
                <Text style={[typography.label, { color: isActive ? colors.onAccent : colors.textMuted }]}>{f.label}</Text>
              </Pressable>
            );
          }}
        />
      </View>

      <View style={{ flex: 1, paddingHorizontal: spacing.xxl }}>
        {isLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : isError ? (
          <Card>
            <Text style={[typography.body, { color: colors.text }]}>{getErrorMessage()}</Text>
            <View style={{ marginTop: spacing.md }}>
              <Button label="Réessayer" variant="secondary" onPress={() => refetch()} />
            </View>
          </Card>
        ) : items.length === 0 ? (
          <Card style={{ backgroundColor: colors.surfaceAlt, borderColor: colors.surfaceAlt }}>
            <Text style={[typography.body, { color: colors.textMuted }]}>Aucun dossier dans cette catégorie.</Text>
          </Card>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            refreshing={isRefetching}
            onRefresh={refetch}
            contentContainerStyle={{ paddingBottom: spacing.xxl }}
          />
        )}
      </View>
    </ScreenContainer>
  );
}
