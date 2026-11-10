// Calculs du zoom de ZoomableImageModal, séparés des gestes pour être testés
// sans téléphone (voir __tests__/zoomMath.test.ts).

export const MIN_SCALE = 1;
export const MAX_SCALE = 5;
// Zoom appliqué par un double toucher : assez pour lire une lésion, sans perdre
// complètement le reste de la photo.
export const DOUBLE_TAP_SCALE = 2.5;

export interface Point {
  x: number;
  y: number;
}

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// Le zoom part du centre : à l'échelle s, la photo dépasse de (s - 1) / 2 fois sa
// taille de chaque côté. On ne laisse pas glisser au-delà, sinon on finit par ne
// plus voir que du noir à côté de la photo.
export function clampTranslation(translation: number, containerSize: number, scale: number): number {
  const max = (containerSize * (scale - 1)) / 2;
  // "+ 0" transforme un éventuel -0 (à taille d'origine) en 0.
  return Math.min(max, Math.max(-max, translation)) + 0;
}
