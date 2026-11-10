import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type ImageSourcePropType,
  type NativeTouchEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  DOUBLE_TAP_SCALE,
  MIN_SCALE,
  clampScale,
  clampTranslation,
  distance,
  midpoint,
  type Point,
} from "./zoomMath";

const DOUBLE_TAP_DELAY_MS = 300;
// En dessous de ce déplacement, un toucher compte comme un simple "tap".
const TAP_SLOP_PX = 6;

interface Transform {
  scale: number;
  x: number;
  y: number;
}

const IDENTITY: Transform = { scale: MIN_SCALE, x: 0, y: 0 };

function touchPoint(touch: NativeTouchEvent): Point {
  return { x: touch.pageX, y: touch.pageY };
}

// Photo en plein écran que le dermatologue peut agrandir pour examiner une lésion :
// pincer pour zoomer, glisser pour se déplacer, toucher deux fois pour agrandir ou
// revenir à la taille d'origine. Écrit avec PanResponder (inclus dans React Native)
// plutôt qu'avec une bibliothèque de gestes, pour ne pas ajouter de module natif.
export function ZoomableImageModal({
  visible,
  source,
  title,
  onClose,
}: {
  visible: boolean;
  source: ImageSourcePropType;
  title: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const scale = useRef(new Animated.Value(MIN_SCALE)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  // Valeur affichée en ce moment, et valeur au début du geste en cours.
  const current = useRef<Transform>(IDENTITY);
  const gesture = useRef({
    start: IDENTITY,
    touchCount: 0,
    startDistance: 1,
    startPoint: { x: 0, y: 0 } as Point,
    moved: false,
    lastTapAt: 0,
  });

  function show(next: Transform) {
    current.current = next;
    scale.setValue(next.scale);
    translateX.setValue(next.x);
    translateY.setValue(next.y);
  }

  function bounded(next: Transform): Transform {
    const s = clampScale(next.scale);
    return {
      scale: s,
      x: clampTranslation(next.x, sizeRef.current.width, s),
      y: clampTranslation(next.y, sizeRef.current.height, s),
    };
  }

  function animateTo(next: Transform) {
    current.current = next;
    Animated.parallel([
      Animated.spring(scale, { toValue: next.scale, useNativeDriver: true, bounciness: 0 }),
      Animated.spring(translateX, { toValue: next.x, useNativeDriver: true, bounciness: 0 }),
      Animated.spring(translateY, { toValue: next.y, useNativeDriver: true, bounciness: 0 }),
    ]).start();
  }

  // Chaque fois que le nombre de doigts change (deuxième doigt posé, un doigt levé
  // pendant un pincement), le geste repart de l'état affiché : sinon la photo
  // sauterait d'un coup vers une position calculée depuis l'ancien point de départ.
  function beginGesture(touches: NativeTouchEvent[]) {
    const g = gesture.current;
    g.start = current.current;
    g.touchCount = touches.length;
    if (touches.length >= 2) {
      const a = touchPoint(touches[0]);
      const b = touchPoint(touches[1]);
      g.startDistance = Math.max(1, distance(a, b));
      g.startPoint = midpoint(a, b);
    } else if (touches.length === 1) {
      g.startPoint = touchPoint(touches[0]);
    }
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event: GestureResponderEvent) => {
          gesture.current.moved = false;
          beginGesture(event.nativeEvent.touches);
        },
        onPanResponderMove: (event: GestureResponderEvent) => {
          const touches = event.nativeEvent.touches;
          const g = gesture.current;
          if (touches.length !== g.touchCount) {
            beginGesture(touches);
            return;
          }
          if (touches.length >= 2) {
            const a = touchPoint(touches[0]);
            const b = touchPoint(touches[1]);
            const center = midpoint(a, b);
            g.moved = true;
            show(
              bounded({
                scale: (g.start.scale * distance(a, b)) / g.startDistance,
                x: g.start.x + (center.x - g.startPoint.x),
                y: g.start.y + (center.y - g.startPoint.y),
              }),
            );
          } else if (touches.length === 1) {
            const point = touchPoint(touches[0]);
            const dx = point.x - g.startPoint.x;
            const dy = point.y - g.startPoint.y;
            if (Math.abs(dx) > TAP_SLOP_PX || Math.abs(dy) > TAP_SLOP_PX) g.moved = true;
            // Glisser n'a de sens qu'une fois agrandi : à taille normale, la photo
            // tient déjà entièrement à l'écran.
            if (g.start.scale > MIN_SCALE) {
              show(bounded({ scale: g.start.scale, x: g.start.x + dx, y: g.start.y + dy }));
            }
          }
        },
        onPanResponderRelease: () => {
          const g = gesture.current;
          if (!g.moved) {
            const now = Date.now();
            if (now - g.lastTapAt < DOUBLE_TAP_DELAY_MS) {
              g.lastTapAt = 0;
              animateTo(current.current.scale > MIN_SCALE ? IDENTITY : { scale: DOUBLE_TAP_SCALE, x: 0, y: 0 });
            } else {
              g.lastTapAt = now;
            }
            return;
          }
          // Un dézoom presque complet revient exactement à la taille d'origine,
          // centrée, plutôt que de rester très légèrement décalé.
          if (current.current.scale < MIN_SCALE + 0.05) animateTo(IDENTITY);
        },
      }),
    // Les valeurs animées et les refs sont stables : un seul PanResponder suffit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Chaque ouverture repart de la photo entière, pas du zoom de la fois précédente.
  useEffect(() => {
    if (visible) show(IDENTITY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View
          style={styles.stage}
          onLayout={(event) => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
          {...panResponder.panHandlers}
        >
          <Animated.Image
            source={source}
            resizeMode="contain"
            accessibilityLabel={title}
            style={[styles.image, { transform: [{ translateX }, { translateY }, { scale }] }]}
          />
        </View>

        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Fermer la photo"
            style={styles.closeButton}
          >
            <Text style={styles.closeLabel}>Fermer</Text>
          </Pressable>
        </View>

        <View style={[styles.hint, { paddingBottom: insets.bottom + 16 }]} pointerEvents="none">
          <Text style={styles.hintText}>Pincez pour zoomer · touchez deux fois pour agrandir</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000" },
  stage: { flex: 1, overflow: "hidden" },
  image: { width: "100%", height: "100%" },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  title: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "700", marginRight: 12 },
  closeButton: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)" },
  closeLabel: { color: "#fff", fontSize: 15, fontWeight: "700" },
  hint: { position: "absolute", bottom: 0, left: 0, right: 0 },
  hintText: { textAlign: "center", color: "rgba(255,255,255,0.75)", fontSize: 13 },
});
