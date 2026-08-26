import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Text, TextInput, View } from "react-native";
import { useTheme } from "../theme/useTheme";
import { Button } from "./Button";
import type { Message } from "../types/api";

interface ChatThreadProps {
  messages: Message[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetryLoad: () => void;
  // Distingue "mes" messages (bulle alignée à droite, couleur accent) de ceux de
  // l'autre côté — patient et admin appellent ce composant avec une règle
  // inversée (senderType === "patient" vs "admin"). Les messages "system"
  // (annonces de changement de statut) ne sont jamais "mine" des deux côtés.
  isMine: (message: Message) => boolean;
  onSend: (body: string) => Promise<unknown>;
}

export function ChatThread({ messages, isLoading, isError, onRetryLoad, isMine, onSend }: ChatThreadProps) {
  const { colors, spacing, radius, typography } = useTheme();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    if (messages?.length) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages?.length]);

  async function handleSend() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await onSend(body);
      setDraft("");
    } finally {
      setSending(false);
    }
  }

  function renderMessage({ item }: { item: Message }) {
    if (item.senderType === "system") {
      return (
        <View style={{ alignItems: "center", marginVertical: spacing.sm, paddingHorizontal: spacing.xl }}>
          <Text style={[typography.caption, { color: colors.textMuted, fontStyle: "italic", textAlign: "center" }]}>
            {item.body}
          </Text>
        </View>
      );
    }

    const mine = isMine(item);
    return (
      <View
        style={{
          alignSelf: mine ? "flex-end" : "flex-start",
          backgroundColor: mine ? colors.accent : colors.surfaceAlt,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          marginHorizontal: spacing.xl,
          marginVertical: spacing.xs,
          maxWidth: "80%",
        }}
      >
        <Text style={[typography.body, { color: mine ? colors.onAccent : colors.text }]}>{item.body}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : isError ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl }}>
          <Text style={[typography.body, { color: colors.text, textAlign: "center", marginBottom: spacing.md }]}>
            Impossible de charger les messages.
          </Text>
          <Button label="Réessayer" variant="secondary" fullWidth={false} onPress={onRetryLoad} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={{ paddingVertical: spacing.lg, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl }}>
              <Text style={[typography.bodyMuted, { color: colors.textMuted, textAlign: "center" }]}>
                Aucun message pour l'instant.
              </Text>
            </View>
          }
        />
      )}

      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          padding: spacing.md,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.bg,
        }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Écrire un message…"
          placeholderTextColor={colors.textMuted}
          multiline
          style={[
            typography.body,
            {
              flex: 1,
              maxHeight: 100,
              color: colors.text,
              backgroundColor: colors.surfaceAlt,
              borderRadius: radius.md,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              marginRight: spacing.sm,
            },
          ]}
        />
        <Button label="Envoyer" variant="primary" fullWidth={false} loading={sending} onPress={handleSend} />
      </View>
    </KeyboardAvoidingView>
  );
}
