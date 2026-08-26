import { env } from "../../config/env";
import { getIdToken } from "../auth/firebaseAuth";
import type { ApiErrorBody } from "../../types/api";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  authenticated?: boolean;
}

// Sans timeout, un serveur/tunnel injoignable qui n'envoie ni réponse ni erreur TCP
// laisse `fetch` en attente indéfiniment — côté RootNavigator, ça se traduit par un
// écran de chargement bloqué pour toujours au lieu d'un message d'erreur avec
// bouton "Réessayer". Vécu en pratique avec le tunnel Cloudflare de dev.
// 70s (pas 15s) : le backend de prod tourne sur le palier gratuit de Render, qui
// met le service en veille après ~15 min sans trafic — la toute première requête
// après une pause peut prendre jusqu'à 50s le temps qu'il se réveille (annoncé par
// Render lui-même). Un timeout plus court déclenchait "Connexion au serveur
// impossible" alors que le serveur était simplement en train de démarrer.
const REQUEST_TIMEOUT_MS = 70000;
// Un envoi de photo (jusqu'à 25 Mo, voir middleware/upload.ts) peut dépasser
// largement le timeout des appels JSON classiques sur une connexion terrain lente —
// et doit lui aussi couvrir un éventuel réveil du service à froid (voir ci-dessus).
const UPLOAD_TIMEOUT_MS = 90000;

// Point d'entrée unique vers l'API : jamais d'URL en dur ailleurs dans l'app, jamais
// un message d'erreur brut du serveur affiché directement à l'utilisateur (voir
// mapApiErrorToUserMessage dans chaque écran, qui décide du texte affiché).
export async function apiRequest<TResponse>(path: string, options: RequestOptions = {}): Promise<TResponse> {
  const { method = "GET", body, authenticated = true } = options;

  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (authenticated) {
    const token = await getIdToken();
    if (!token) {
      throw new ApiError(401, "unauthenticated", "Session expirée, reconnectez-vous.");
    }
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, "network_error", "Impossible de joindre le serveur. Vérifiez votre connexion.");
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  const json = (await response.json().catch(() => null)) as TResponse | ApiErrorBody | null;

  if (!response.ok) {
    const errorBody = json as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      errorBody?.error?.code ?? "unknown_error",
      errorBody?.error?.message ?? "Une erreur est survenue.",
      errorBody?.error?.details,
    );
  }

  return json as TResponse;
}

// Pour l'envoi de fichiers (photos) : le corps est un FormData, jamais du JSON —
// on laisse fetch poser lui-même l'en-tête Content-Type (avec sa boundary
// multipart), le fixer à la main casserait le parsing côté serveur (voir
// middleware/upload.ts).
export async function apiUpload<TResponse>(path: string, formData: FormData): Promise<TResponse> {
  const token = await getIdToken();
  if (!token) {
    throw new ApiError(401, "unauthenticated", "Session expirée, reconnectez-vous.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, "network_error", "Impossible de joindre le serveur. Vérifiez votre connexion.");
  } finally {
    clearTimeout(timer);
  }

  const json = (await response.json().catch(() => null)) as TResponse | ApiErrorBody | null;

  if (!response.ok) {
    const errorBody = json as ApiErrorBody | null;
    throw new ApiError(
      response.status,
      errorBody?.error?.code ?? "unknown_error",
      errorBody?.error?.message ?? "Une erreur est survenue.",
      errorBody?.error?.details,
    );
  }

  return json as TResponse;
}
