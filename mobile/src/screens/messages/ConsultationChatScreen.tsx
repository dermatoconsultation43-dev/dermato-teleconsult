import React from "react";
import { Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsFocused } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Button } from "../../components/Button";
import { ChatThread } from "../../components/ChatThread";
import { useTheme } from "../../theme/useTheme";
import { listMessages, sendMessage } from "../../services/api/messages";
import type { RootStackParamList } from "../../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "ConsultationChat">;

// Pas de websocket ni de push (V1 in-app uniquement, voir plan) : un polling
// discret toutes les 15s, actif seulement quand l'écran a le focus, fait office
// de "presque temps réel" sans solliciter le serveur en permanence.
const POLL_INTERVAL_MS = 15000;

export function ConsultationChatScreen({ route, navigation }: Props) {
  const { consultationId } = route.params;
  const { colors, spacing, typography } = useTheme();
  const isFocused = useIsFocused();
  const queryClient = useQueryClient();

  const queryKey = ["messages", consultationId];
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => listMessages(consultationId),
    refetchInterval: isFocused ? POLL_INTERVAL_MS : false,
  });

  async function handleSend(body: string) {
    await sendMessage(consultationId, body);
    await queryClient.invalidateQueries({ queryKey });
    // Le badge de non-lus sur le Dashboard/MessagesList dépend du même champ
    // patientLastReadMessagesAt que ce fil vient de mettre à jour côté backend.
    queryClient.invalidateQueries({ queryKey: ["consultations", "mine"] });
  }

  return (
    <ScreenContainer scroll={false} padded={false}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: spacing.xxl,
          paddingTop: spacing.lg,
          paddingBottom: spacing.md,
        }}
      >
        <Button label="← Retour" variant="ghost" fullWidth={false} onPress={() => navigation.goBack()} />
        <Text style={[typography.h2, { color: colors.text, marginLeft: spacing.md }]}>Messages</Text>
      </View>
      <ChatThread
        messages={data?.items}
        isLoading={isLoading}
        isError={isError}
        onRetryLoad={() => refetch()}
        isMine={(m) => m.senderType === "patient"}
        onSend={handleSend}
      />
    </ScreenContainer>
  );
}
