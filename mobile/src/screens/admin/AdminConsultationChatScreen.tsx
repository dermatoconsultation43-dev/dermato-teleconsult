import React from "react";
import { Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsFocused } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Button } from "../../components/Button";
import { ChatThread } from "../../components/ChatThread";
import { useTheme } from "../../theme/useTheme";
import { adminListMessages, adminSendMessage } from "../../services/api/admin";
import type { AdminStackParamList } from "../../navigation/adminTypes";

type Props = NativeStackScreenProps<AdminStackParamList, "AdminConsultationChat">;

const POLL_INTERVAL_MS = 15000;

export function AdminConsultationChatScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const { colors, spacing, typography } = useTheme();
  const isFocused = useIsFocused();
  const queryClient = useQueryClient();

  const queryKey = ["admin", "messages", id];
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => adminListMessages(id),
    refetchInterval: isFocused ? POLL_INTERVAL_MS : false,
  });

  async function handleSend(body: string) {
    await adminSendMessage(id, body);
    await queryClient.invalidateQueries({ queryKey });
    // Le badge de non-lus sur la liste/le détail admin dépend du même champ
    // adminLastReadMessagesAt que ce fil vient de mettre à jour côté backend.
    queryClient.invalidateQueries({ queryKey: ["admin", "consultations"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "consultation", id] });
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
        isMine={(m) => m.senderType === "admin"}
        onSend={handleSend}
      />
    </ScreenContainer>
  );
}
