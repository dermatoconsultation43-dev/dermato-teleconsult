import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Text, View } from "react-native";
import { useTheme } from "../theme/useTheme";
import { BottomWave } from "../components/decor/Waves";
import { Button } from "../components/Button";

const LOGO = require("../assets/brand/logo.jpg");

// Au-delà de ce délai, on suppose que l'utilisateur a compris que ça traîne — pas la
// peine d'attendre les 70s du timeout réseau (voir REQUEST_TIMEOUT_MS dans client.ts,
// qui couvre le réveil du backend Render gratuit) pour lui laisser une échappatoire.
const FALLBACK_DELAY_MS = 6000;

interface Props {
  onSignOut: () => void;
}

// Prolonge visuellement l'écran de démarrage natif (même fond, voir
// android/app/src/main/res/values/colors.xml#splashBackground) pendant la brève
// vérification de session Firebase — aucune coupure entre le natif et le JS.
export function LoadingScreen({ onSignOut }: Props) {
  const { colors, spacing, typography } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start();
    Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }),
    ).start();
  }, [opacity, translateY, spin]);

  useEffect(() => {
    const timer = setTimeout(() => setShowFallback(true), FALLBACK_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
      <BottomWave soft={colors.accentSoft} strong={colors.surfaceAlt} height={160} />

      <Animated.View style={{ opacity, transform: [{ translateY }], alignItems: "center" }}>
        <Image
          source={LOGO}
          resizeMode="contain"
          style={{ width: 120, height: 120, borderRadius: 24, marginBottom: spacing.xl }}
        />
        <Text style={[typography.h1, { color: colors.text, letterSpacing: 0.5 }]}>Dermato Téléconsult</Text>
        <Text style={[typography.label, { color: colors.accent, letterSpacing: 1.5, marginTop: spacing.xs }]}>
          TÉLÉCONSULTATION DERMATOLOGIQUE
        </Text>

        <View style={{ width: 36, height: 2, backgroundColor: colors.accent, marginVertical: spacing.xl, borderRadius: 1 }} />

        <Text style={[typography.bodyMuted, { color: colors.textMuted }]}>Votre peau, notre expertise.</Text>
        <Text style={[typography.body, { color: colors.accentStrong, fontWeight: "700", marginTop: spacing.xs }]}>
          Où que vous soyez.
        </Text>

        <Animated.View
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            borderWidth: 2.5,
            borderColor: colors.accentSoft,
            borderTopColor: colors.accent,
            marginTop: spacing.xxxl,
            transform: [{ rotate }],
          }}
        />

        {showFallback ? (
          <View style={{ alignItems: "center", marginTop: spacing.xxl, paddingHorizontal: spacing.xl }}>
            <Text style={[typography.caption, { color: colors.textMuted, textAlign: "center", marginBottom: spacing.md }]}>
              La connexion prend plus de temps que prévu (le serveur peut se réveiller après une pause).
            </Text>
            <Button label="Se déconnecter" variant="ghost" onPress={onSignOut} />
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}
