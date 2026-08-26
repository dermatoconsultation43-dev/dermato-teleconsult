import React, { useRef } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme/useTheme";

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  testID?: string;
  /** Surcharge ponctuelle (ex. rouge pour une action destructrice) — appliquée
   * après les styles du variant, jamais à leur place. */
  style?: StyleProp<ViewStyle>;
}

// Zone tactile confortable (>=48dp de hauteur) et état loading intégré pour éviter
// les doubles soumissions accidentelles — le bouton se désactive lui-même pendant
// l'appel réseau plutôt que de compter sur chaque écran pour le refaire.
export function Button({ label, onPress, variant = "primary", loading, disabled, fullWidth = true, testID, style }: ButtonProps) {
  const { colors, spacing, radius, typography } = useTheme();
  const isDisabled = disabled || loading;
  const scale = useRef(new Animated.Value(1)).current;

  const backgroundColor =
    variant === "primary" ? colors.accent : variant === "secondary" ? colors.surfaceAlt : "transparent";
  const textColor = variant === "primary" ? colors.onAccent : colors.accent;
  const borderColor = variant === "ghost" ? "transparent" : variant === "secondary" ? colors.border : backgroundColor;

  // Micro-interaction : léger tassement au toucher plutôt qu'un simple changement
  // d'opacité — donne une sensation de bouton "physique" pressé, pas seulement
  // désactivé visuellement.
  function pressIn() {
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  }
  function pressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  }

  return (
    <Animated.View style={{ transform: [{ scale }], alignSelf: fullWidth ? "stretch" : "flex-start" }}>
      <Pressable
        testID={testID}
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        hitSlop={8}
        style={({ pressed }) => [
          styles.base,
          {
            backgroundColor,
            borderColor,
            borderWidth: variant === "secondary" ? 1 : 0,
            borderRadius: radius.md,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing.xl,
            opacity: isDisabled ? 0.6 : pressed ? 0.9 : 1,
            shadowColor: variant === "primary" ? colors.accentStrong : "transparent",
            shadowOpacity: variant === "primary" && !isDisabled ? 0.25 : 0,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: variant === "primary" && !isDisabled ? 3 : 0,
          },
          style,
        ]}
      >
        <View style={styles.content}>
          {loading ? (
            <ActivityIndicator color={textColor} style={{ marginRight: spacing.sm }} />
          ) : null}
          <Text style={[typography.body, { color: textColor, fontWeight: "600" }]}>{label}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
  },
});
