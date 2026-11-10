import { describe, expect, it } from "@jest/globals";
import { MAX_SCALE, MIN_SCALE, clampScale, clampTranslation, distance, midpoint } from "../src/components/zoomMath";

describe("zoom des photos (visualiseur plein écran)", () => {
  it("borne le zoom entre la taille d'origine et 5x", () => {
    expect(clampScale(0.3)).toBe(MIN_SCALE);
    expect(clampScale(2)).toBe(2);
    expect(clampScale(12)).toBe(MAX_SCALE);
  });

  it("mesure l'écart et le centre entre deux doigts", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(midpoint({ x: 10, y: 20 }, { x: 30, y: 40 })).toEqual({ x: 20, y: 30 });
  });

  it("empêche de faire sortir la photo agrandie de l'écran", () => {
    // Écran de 400 px, zoom 3x : la photo dépasse de 400 px de chaque côté.
    expect(clampTranslation(150, 400, 3)).toBe(150);
    expect(clampTranslation(900, 400, 3)).toBe(400);
    expect(clampTranslation(-900, 400, 3)).toBe(-400);
  });

  it("ne laisse pas déplacer la photo à taille d'origine", () => {
    expect(clampTranslation(120, 400, 1)).toBe(0);
    expect(clampTranslation(-120, 400, 1)).toBe(0);
  });
});
