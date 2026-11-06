import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Circle, Ellipse, Line, Rect, Svg, Text as SvgText } from "react-native-svg";
import { useTheme } from "../theme/useTheme";

// Schéma corporel simplifié (pas anatomiquement précis, juste assez lisible pour
// pointer une zone) — même principe que les cartes du corps des applications de
// téléconsultation type OMS : une silhouette avant/arrière avec des zones tactiles
// larges plutôt que des contours anatomiques réels, pour rester utilisable au
// doigt sur un petit écran.
// Vue de face et vue de dos ont chacune leurs propres codes (suffixe "_arriere"
// côté dos) : avant, les deux vues partageaient les mêmes codes, si bien qu'un bras
// coché de face apparaissait aussi coché de dos. Les codes de face existants sont
// conservés tels quels pour rester compatibles avec les dossiers déjà enregistrés.
export const BODY_ZONE_LABELS: Record<string, string> = {
  tete: "Tête / visage",
  cou: "Cou (avant)",
  torse: "Torse / ventre",
  bras_droit: "Bras droit (avant)",
  bras_gauche: "Bras gauche (avant)",
  avant_bras_droit: "Avant-bras droit (avant)",
  avant_bras_gauche: "Avant-bras gauche (avant)",
  main_droite: "Main droite (paume)",
  main_gauche: "Main gauche (paume)",
  cuisse_droite: "Cuisse droite (avant)",
  cuisse_gauche: "Cuisse gauche (avant)",
  jambe_droite: "Jambe droite (avant)",
  jambe_gauche: "Jambe gauche (avant)",
  pied_droit: "Pied droit (dessus)",
  pied_gauche: "Pied gauche (dessus)",

  tete_arriere: "Arrière de la tête / cuir chevelu",
  nuque: "Nuque",
  dos: "Dos",
  bras_droit_arriere: "Bras droit (arrière)",
  bras_gauche_arriere: "Bras gauche (arrière)",
  avant_bras_droit_arriere: "Avant-bras droit (arrière)",
  avant_bras_gauche_arriere: "Avant-bras gauche (arrière)",
  main_droite_arriere: "Main droite (dos de la main)",
  main_gauche_arriere: "Main gauche (dos de la main)",
  cuisse_droite_arriere: "Cuisse droite (arrière)",
  cuisse_gauche_arriere: "Cuisse gauche (arrière)",
  jambe_droite_arriere: "Mollet droit",
  jambe_gauche_arriere: "Mollet gauche",
  pied_droit_arriere: "Talon / pied droit (arrière)",
  pied_gauche_arriere: "Talon / pied gauche (arrière)",
};

type ShapeDef =
  | { code: string; kind: "circle"; cx: number; cy: number; r: number }
  | { code: string; kind: "rect"; x: number; y: number; width: number; height: number; rx: number }
  | { code: string; kind: "ellipse"; cx: number; cy: number; rx: number; ry: number };

// Vue de face : gauche/droite anatomiques telles qu'on les verrait en regardant la
// personne (donc inversées à l'écran — bras_droit du patient à gauche de l'image).
const FRONT_SHAPES: ShapeDef[] = [
  { code: "tete", kind: "circle", cx: 100, cy: 30, r: 22 },
  { code: "cou", kind: "rect", x: 90, y: 50, width: 20, height: 14, rx: 6 },
  { code: "torse", kind: "rect", x: 62, y: 62, width: 76, height: 100, rx: 20 },
  { code: "bras_droit", kind: "rect", x: 30, y: 66, width: 26, height: 48, rx: 13 },
  { code: "avant_bras_droit", kind: "rect", x: 32, y: 114, width: 22, height: 52, rx: 11 },
  { code: "bras_gauche", kind: "rect", x: 144, y: 66, width: 26, height: 48, rx: 13 },
  { code: "avant_bras_gauche", kind: "rect", x: 146, y: 114, width: 22, height: 52, rx: 11 },
  { code: "main_droite", kind: "ellipse", cx: 43, cy: 178, rx: 16, ry: 18 },
  { code: "main_gauche", kind: "ellipse", cx: 157, cy: 178, rx: 16, ry: 18 },
  { code: "cuisse_droite", kind: "rect", x: 64, y: 162, width: 32, height: 68, rx: 16 },
  { code: "jambe_droite", kind: "rect", x: 67, y: 230, width: 26, height: 72, rx: 13 },
  { code: "cuisse_gauche", kind: "rect", x: 104, y: 162, width: 32, height: 68, rx: 16 },
  { code: "jambe_gauche", kind: "rect", x: 107, y: 230, width: 26, height: 72, rx: 13 },
  { code: "pied_droit", kind: "ellipse", cx: 80, cy: 320, rx: 20, ry: 14 },
  { code: "pied_gauche", kind: "ellipse", cx: 120, cy: 320, rx: 20, ry: 14 },
];

// Vue de dos : la personne a pivoté à 180°, donc gauche/droite anatomiques sont
// inversées par rapport à la vue de face pour rester correctes (le bras droit du
// patient reste à droite de l'écran quand on le voit de dos).
const BACK_SHAPES: ShapeDef[] = [
  { code: "tete_arriere", kind: "circle", cx: 100, cy: 30, r: 22 },
  { code: "nuque", kind: "rect", x: 90, y: 50, width: 20, height: 14, rx: 6 },
  { code: "dos", kind: "rect", x: 62, y: 62, width: 76, height: 100, rx: 20 },
  { code: "bras_gauche_arriere", kind: "rect", x: 30, y: 66, width: 26, height: 48, rx: 13 },
  { code: "avant_bras_gauche_arriere", kind: "rect", x: 32, y: 114, width: 22, height: 52, rx: 11 },
  { code: "bras_droit_arriere", kind: "rect", x: 144, y: 66, width: 26, height: 48, rx: 13 },
  { code: "avant_bras_droit_arriere", kind: "rect", x: 146, y: 114, width: 22, height: 52, rx: 11 },
  { code: "main_gauche_arriere", kind: "ellipse", cx: 43, cy: 178, rx: 16, ry: 18 },
  { code: "main_droite_arriere", kind: "ellipse", cx: 157, cy: 178, rx: 16, ry: 18 },
  { code: "cuisse_gauche_arriere", kind: "rect", x: 64, y: 162, width: 32, height: 68, rx: 16 },
  { code: "jambe_gauche_arriere", kind: "rect", x: 67, y: 230, width: 26, height: 72, rx: 13 },
  { code: "cuisse_droite_arriere", kind: "rect", x: 104, y: 162, width: 32, height: 68, rx: 16 },
  { code: "jambe_droite_arriere", kind: "rect", x: 107, y: 230, width: 26, height: 72, rx: 13 },
  { code: "pied_gauche_arriere", kind: "ellipse", cx: 80, cy: 320, rx: 20, ry: 14 },
  { code: "pied_droit_arriere", kind: "ellipse", cx: 120, cy: 320, rx: 20, ry: 14 },
];

const DIAGRAM_WIDTH = 200;
const DIAGRAM_HEIGHT = 350;
// viewBox = "0 0 200 350" rendu à la même taille (200x350) : échelle 1:1, mais
// gardé comme facteur explicite plutôt qu'en dur pour rester correct si la taille
// affichée change un jour.
const SCALE = 1;

function boundingBox(shape: ShapeDef): { x: number; y: number; width: number; height: number } {
  if (shape.kind === "rect") return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
  if (shape.kind === "circle") return { x: shape.cx - shape.r, y: shape.cy - shape.r, width: shape.r * 2, height: shape.r * 2 };
  return { x: shape.cx - shape.rx, y: shape.cy - shape.ry, width: shape.rx * 2, height: shape.ry * 2 };
}

interface BodyMapProps {
  selected: string[];
  onChange: (next: string[]) => void;
}

export function BodyMap({ selected, onChange }: BodyMapProps) {
  const { colors, spacing, radius, typography } = useTheme();
  const [view, setView] = useState<"front" | "back">("front");
  const shapes = view === "front" ? FRONT_SHAPES : BACK_SHAPES;

  function toggle(code: string) {
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  }

  // Nombre de zones cochées dans chaque vue, affiché sur l'onglet : sans lui, rien
  // n'indique depuis la vue de face que des zones ont déjà été cochées de dos.
  function countFor(v: "front" | "back") {
    const codes = (v === "front" ? FRONT_SHAPES : BACK_SHAPES).map((s) => s.code);
    return selected.filter((c) => codes.includes(c)).length;
  }

  function fillFor(code: string) {
    return selected.includes(code) ? colors.accent : colors.surfaceAlt;
  }
  function strokeFor(code: string) {
    return selected.includes(code) ? colors.accentStrong : colors.border;
  }

  return (
    <View>
      <View style={[styles.tabs, { marginBottom: spacing.md }]}>
        {(["front", "back"] as const).map((v) => {
          const isActive = v === view;
          return (
            <Pressable
              key={v}
              onPress={() => setView(v)}
              style={[
                styles.tab,
                {
                  borderRadius: radius.pill,
                  backgroundColor: isActive ? colors.accent : colors.surface,
                  borderColor: isActive ? colors.accent : colors.border,
                },
              ]}
            >
              <Text style={[typography.label, { color: isActive ? colors.onAccent : colors.textMuted }]}>
                {v === "front" ? "Vue de face" : "Vue de dos"}
                {countFor(v) > 0 ? ` (${countFor(v)})` : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.diagramWrap, { backgroundColor: colors.surfaceAlt, borderRadius: radius.lg }]}>
        <View style={{ width: DIAGRAM_WIDTH, height: DIAGRAM_HEIGHT }}>
          <Svg width={DIAGRAM_WIDTH} height={DIAGRAM_HEIGHT} viewBox="0 0 200 350">
            {shapes.map((shape) => {
              const common = { fill: fillFor(shape.code), stroke: strokeFor(shape.code), strokeWidth: 1.5 };
              if (shape.kind === "circle") return <Circle key={shape.code} {...common} cx={shape.cx} cy={shape.cy} r={shape.r} />;
              if (shape.kind === "ellipse")
                return <Ellipse key={shape.code} {...common} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} />;
              return (
                <Rect key={shape.code} {...common} x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx} />
              );
            })}
            {/* Repères purement décoratifs (pas de zone tactile associée) pour que la
                vue de dos soit visuellement distincte de la vue de face au premier
                coup d'œil — sinon les deux silhouettes sont identiques hors torse/dos
                et le changement d'onglet paraît ne "rien faire". */}
            {view === "front" ? (
              <>
                <Circle cx={92} cy={27} r={2.2} fill={colors.textMuted} />
                <Circle cx={108} cy={27} r={2.2} fill={colors.textMuted} />
              </>
            ) : (
              <Line x1={100} y1={68} x2={100} y2={156} stroke={colors.border} strokeWidth={1.5} />
            )}
            <SvgText x={100} y={343} fontSize={12} fontWeight="600" fill={colors.textMuted} textAnchor="middle">
              {view === "front" ? "VUE DE FACE" : "VUE DE DOS"}
            </SvgText>
          </Svg>
          {/* Zones tactiles en calques RN plutôt qu'un onPress posé directement sur les
              formes SVG : peu fiable avec la New Architecture (Fabric) — le "bonhomme"
              restait insensible au toucher sur certains appareils malgré un rendu
              visuel correct. Un Pressable RN natif par zone, positionné en absolu à
              partir de la même géométrie, est la seule interaction garantie fiable. */}
          {shapes.map((shape) => {
            const box = boundingBox(shape);
            return (
              <Pressable
                key={shape.code}
                onPress={() => toggle(shape.code)}
                hitSlop={4}
                style={{
                  position: "absolute",
                  left: box.x * SCALE,
                  top: box.y * SCALE,
                  width: box.width * SCALE,
                  height: box.height * SCALE,
                }}
              />
            );
          })}
        </View>
      </View>

      {selected.length > 0 ? (
        <View style={[styles.chips, { marginTop: spacing.md }]}>
          {selected.map((code) => (
            <Pressable
              key={code}
              onPress={() => toggle(code)}
              style={[styles.chip, { backgroundColor: colors.accentSoft, borderRadius: radius.pill }]}
            >
              <Text style={[typography.caption, { color: colors.accentStrong, fontWeight: "600" }]}>
                {BODY_ZONE_LABELS[code] ?? code} ✕
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.md }]}>
          Touchez les zones du corps concernées (plusieurs choix possibles).
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", gap: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1.5 },
  diagramWrap: { alignItems: "center", paddingVertical: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6 },
});
