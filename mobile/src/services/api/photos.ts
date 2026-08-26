import { ApiError, apiRequest, apiUpload } from "./client";
import { env } from "../../config/env";
import { getIdToken } from "../auth/firebaseAuth";
import type { ApiErrorBody, Photo, PhotoSlot } from "../../types/api";

// Upload en une seule étape (le fichier part directement vers le backend, qui le
// retransmet à Google Drive — voir backend/src/services/googleDrive.ts). Remplace
// l'ancien flux à deux temps (URL signée GCS + confirmation) : il n'y a plus rien
// à confirmer, l'appel réussit ou échoue.
export function uploadPhoto(
  consultationId: string,
  input: { slot: PhotoSlot; localUri: string; mimeType: string; fileName?: string },
): Promise<Photo> {
  const formData = new FormData();
  formData.append("slot", input.slot);
  // React Native accepte cette forme d'objet pour un champ fichier dans un
  // FormData — pas de lecture manuelle des octets côté app, `fetch` s'en charge.
  formData.append("file", {
    uri: input.localUri,
    type: input.mimeType,
    name: input.fileName ?? `${input.slot}.${input.mimeType.split("/")[1] ?? "jpg"}`,
  } as unknown as Blob);

  return apiUpload<Photo>(`/consultations/${consultationId}/photos`, formData);
}

export function deletePhoto(consultationId: string, photoId: string) {
  return apiRequest<void>(`/consultations/${consultationId}/photos/${photoId}`, { method: "DELETE" });
}

// La photo n'est jamais publique. On a longtemps passé le jeton via
// `source={{ uri, headers }}` sur <Image>, mais avec la New Architecture
// (newArchEnabled=true, voir android/gradle.properties) ces en-têtes ne sont
// pas toujours transmis au chargeur d'image natif côté Android : la requête
// part sans Authorization, le backend répond 401 en JSON, et l'image échoue
// silencieusement au décodage (constaté en pratique, systématique sur toutes
// les photos). On récupère donc les octets nous-mêmes en JS — là où
// l'en-tête est fiable, comme pour tout le reste de l'API — et on les
// convertit en data URI, qu'<Image> peut afficher sans dépendre du réseau
// natif ni d'aucun en-tête.
// Même valeur que REQUEST_TIMEOUT_MS dans client.ts : le backend de prod tourne sur
// le palier gratuit de Render, qui peut mettre jusqu'à 50s à se réveiller.
const PHOTO_REQUEST_TIMEOUT_MS = 70000;

export async function getPhotoDataUri(path: string): Promise<string> {
  const token = await getIdToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PHOTO_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, "network_error", "Impossible de joindre le serveur. Vérifiez votre connexion.");
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    // On lit le corps d'erreur JSON du backend (voir apiRequest dans client.ts) au lieu
    // d'un message générique : sans ça, un 401/403/500 ressemblent tous à la même
    // "Impossible de charger la photo.", impossible à distinguer d'un vrai problème
    // de fichier Drive.
    const errorBody = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      errorBody?.error?.code ?? "photo_load_failed",
      errorBody?.error?.message ?? "Impossible de charger la photo.",
      errorBody?.error?.details,
    );
  }
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new ApiError(0, "photo_read_failed", "Impossible de lire la photo."));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}
