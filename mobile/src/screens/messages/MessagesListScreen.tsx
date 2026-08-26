import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { StatusBadge } from "../../components/StatusBadge";
import { useTheme } from "../../theme/useTheme";
import { listMyConsultations } from "../../services/api/consultations";
import type { ConsultationSummary } from "../../types/api";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "MessagesList">;

export function MessagesListScreen({ navigation }: Props) {
  const { colors, spacing, radius, typography } = useTheme();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["consultations", "mine"],
    queryFn: () => listMyConsultations(),
  });

  // Un brouillon n'est pas encore soumis, donc pas encore d'équipe admin/dermato
  // assignée avec qui échanger (voir messages.service.ts#assertOwnedConsultation
  // côté backend, qui refuse la même chose).
  const consultations = (data?.items ?? []).filter((item: ConsultationSummary) => item.status !== "draft");

  function renderItem(item: ConsultationSummary) {
    const title = item.nomComplet?.trim() || `Dossier n°${String(item.refNumber).padStart(6, "0")}`;
    return (
      <Pressable key={item.id} onPress={() => navigation.navigate("ConsultationChat", { consultationId: item.id })}>
        <Card style={{ marginBottom: spacing.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1, marginRight: spacing.md }}>
              <Text style={[typography.h2, { color: colors.text }]} numberOfLines={1}>
                {title}
              </Text>
              <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2 }]}>
                Dossier n°{String(item.refNumber).padStart(6, "0")}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <StatusBadge status={item.status} />
              {item.unreadMessagesCount > 0 ? (
                <View
                  style={{
                    marginTop: spacing.xs,
                    backgroundColor: colors.danger,
                    borderRadius: radius.pill,
                    minWidth: 22,
                    height: 22,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 6,
                  }}
                >
                  <Text style={[typography.caption, { color: "#fff", fontWeight: "700" }]}>
                    {item.unreadMessagesCount}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </Card>
      </Pressable>
    );
  }

  return (
    <ScreenContainer>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.lg }}>
        <Button label="← Retour" variant="ghost" fullWidth={false} onPress={() => navigation.goBack()} />
      </View>
      <Text style={[typography.h1, { color: colors.text, marginBottom: spacing.lg }]}>Mes messages</Text>

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
        <Card style={{ alignItems: "center" }}>
          <Text style={[typography.body, { color: colors.text, textAlign: "center" }]}>
            Aucune conversation pour l'instant.
          </Text>
          <Text style={[typography.bodyMuted, { color: colors.textMuted, textAlign: "center", marginTop: spacing.xs }]}>
            Un fil de discussion s'ouvre dès qu'un dossier est soumis.
          </Text>
        </Card>
      ) : (
        <>{consultations.map(renderItem)}</>
      )}
    </ScreenContainer>
  );
}
