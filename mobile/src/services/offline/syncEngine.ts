import NetInfo from "@react-native-community/netinfo";
import { recordConsent as recordConsentApi, saveDraft, submitConsultation } from "../api/consultations";
import { recordWalkInConsent, saveWalkInDraft, submitWalkInConsultation, uploadWalkInPhoto } from "../api/agent";
import { uploadPhoto } from "../api/photos";
import { ApiError } from "../api/client";
import { countPendingDrafts, getPendingDrafts, markDraftStatus, removeDraftLocally } from "./draftQueue";
import {
  countPendingPhotos,
  getPendingPhotos,
  markPhotoStatus,
  removePhotoLocally,
  setPhotoConsultationId,
  type PhotoQueueRow,
} from "./photoQueue";
import {
  countPendingConsents,
  getPendingConsents,
  markConsentStatus,
  removeConsentLocally,
  setConsentConsultationId,
  type ConsentQueueRow,
} from "./consentQueue";
import {
  countPendingSubmits,
  getPendingSubmits,
  markSubmitStatus,
  removeSubmitLocally,
  setSubmitConsultationId,
  type SubmitQueueRow,
} from "./submitQueue";
import { useOfflineStore } from "../../store/offlineStore";
import { useConsultationDraftStore } from "../../store/consultationDraftStore";

let started = false;
let syncingDrafts = false;
let syncingPhotos = false;
let syncingConsents = false;
let syncingSubmits = false;

// Filet de sécurité en plus du déclenchement sur changement de connectivité :
// un échec ponctuel (backend qui redémarre le temps d'un déploiement, coupure
// trop brève pour que le téléphone la détecte comme un vrai changement d'état
// réseau) laisse sinon un élément "en attente" indéfiniment tant que
// isConnected/isInternetReachable ne rebasculent pas vraiment. L'utilisateur
// (souvent un agent terrain, pas quelqu'un qui va aller chercher un bouton
// "Réessayer" ou couper/rallumer le mode avion) n'a rien à faire : ça se
// résorbe tout seul en arrière-plan.
const RETRY_INTERVAL_MS = 30000;

function refreshPendingCount(): void {
  // Un seul compteur affiché (voir OfflineBanner) : la somme des quatre files —
  // peu importe, du point de vue de l'utilisateur, que ce soit du texte, une
  // photo, le consentement ou l'envoi final qui attend encore d'être envoyé.
  useOfflineStore
    .getState()
    .setPendingCount(countPendingDrafts() + countPendingPhotos() + countPendingConsents() + countPendingSubmits());
}

// À appeler une seule fois au démarrage de l'app (voir App.tsx). Écoute la
// connectivité en continu : dès qu'on repasse en ligne (y compris au tout
// premier lancement si l'app démarre déjà connectée avec des brouillons ou des
// photos laissés en attente d'une session précédente), on rejoue les deux files.
export function initSyncEngine(): void {
  if (started) return;
  started = true;

  refreshPendingCount();

  NetInfo.fetch()
    .then((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      useOfflineStore.getState().setOnline(online);
      if (online) void syncAll();
    })
    .catch(() => {});

  NetInfo.addEventListener((state) => {
    const wasOnline = useOfflineStore.getState().isOnline;
    const nowOnline = Boolean(state.isConnected && state.isInternetReachable !== false);
    useOfflineStore.getState().setOnline(nowOnline);
    if (nowOnline && !wasOnline) {
      void syncAll();
    }
  });

  setInterval(() => {
    const { isOnline, pendingCount } = useOfflineStore.getState();
    if (isOnline && pendingCount > 0) {
      void syncAll();
    }
  }, RETRY_INTERVAL_MS);
}

// Ordre important : les brouillons d'abord (leur succès débloque, via
// setPhotoConsultationId/setConsentConsultationId/setSubmitConsultationId, tout
// ce qui attendait un id serveur) ; l'envoi final en dernier, puisque le
// serveur exige que les photos requises soient déjà reçues avant d'accepter un
// dossier "soumis" — voir syncPendingSubmits.
export async function syncAll(): Promise<void> {
  await syncPendingDrafts();
  await syncPendingConsents();
  await syncPendingPhotos();
  await syncPendingSubmits();
}

// Exporté pour un bouton "Réessayer maintenant" côté UI, en plus du
// déclenchement automatique au retour de connexion.
export async function syncPendingDrafts(): Promise<void> {
  if (syncingDrafts) return;
  syncingDrafts = true;
  try {
    const pending = getPendingDrafts();
    for (const row of pending) {
      useOfflineStore.getState().setDraftStatus(row.clientUuid, "syncing");
      markDraftStatus(row.clientUuid, "syncing");

      try {
        // Le mode ("patient" ou "agent") est celui enregistré dans draft_queue au
        // moment de la mise en file (voir draftQueue.ts#saveDraftLocally) — pas
        // celui du formulaire actif, qui a pu changer ou avoir été réinitialisé
        // depuis (ex. redémarrage de l'app), et rejouer sur le mauvais point
        // d'accès échouerait (403 "Aucun profil patient actif pour ce compte."
        // si un dossier agent est rejoué via l'endpoint patient, et vice-versa).
        const result =
          row.mode === "agent" ? await saveWalkInDraft(row.clientUuid, row.payload) : await saveDraft(row.clientUuid, row.payload);
        removeDraftLocally(row.clientUuid);
        useOfflineStore.getState().setDraftStatus(row.clientUuid, "synced");
        setPhotoConsultationId(row.clientUuid, result.id);
        setConsentConsultationId(row.clientUuid, result.id);
        setSubmitConsultationId(row.clientUuid, result.id);

        // Si le brouillon actif dans le formulaire en cours est celui qu'on
        // vient de synchroniser, on lui donne son id serveur pour débloquer
        // les étapes suivantes (photos, consentement) qui en ont besoin.
        const activeDraft = useConsultationDraftStore.getState();
        if (activeDraft.clientUuid === row.clientUuid && !activeDraft.consultationId) {
          activeDraft.setConsultationMeta(result.id, result.refNumber);
        }
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Échec de la synchronisation.";
        markDraftStatus(row.clientUuid, "failed", message);
        useOfflineStore.getState().setDraftStatus(row.clientUuid, "failed", message);
      }

      refreshPendingCount();
    }
  } finally {
    syncingDrafts = false;
  }
}

async function replayQueuedConsent(row: ConsentQueueRow): Promise<void> {
  if (!row.consultationId) return; // pas encore débloqué (voir setConsentConsultationId)

  if (row.mode === "agent") {
    await recordWalkInConsent(row.consultationId, row.consentTextVersion);
  } else {
    await recordConsentApi(row.consultationId, row.consentTextVersion);
  }
}

// Exporté pour un bouton "Réessayer maintenant" côté UI, comme les deux files
// ci-dessus. Rejoué juste après les brouillons : c'est leur succès qui fournit
// l'id serveur nécessaire (voir setConsentConsultationId) à un consentement
// donné pendant que le dossier était encore hors ligne.
export async function syncPendingConsents(): Promise<void> {
  if (syncingConsents) return;
  syncingConsents = true;
  try {
    const pending = getPendingConsents();
    for (const row of pending) {
      markConsentStatus(row.clientUuid, "syncing");
      try {
        await replayQueuedConsent(row);
        removeConsentLocally(row.clientUuid);
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Échec de l'enregistrement du consentement.";
        markConsentStatus(row.clientUuid, "failed", message);
      }
      refreshPendingCount();
    }
  } finally {
    syncingConsents = false;
  }
}

async function uploadQueuedPhoto(row: PhotoQueueRow): Promise<void> {
  if (!row.consultationId) return; // pas encore débloquée (voir setPhotoConsultationId)

  const photo =
    row.mode === "agent"
      ? await uploadWalkInPhoto(row.consultationId, { slot: row.slot, localUri: row.localUri, mimeType: row.mimeType })
      : await uploadPhoto(row.consultationId, { slot: row.slot, localUri: row.localUri, mimeType: row.mimeType });

  // Si l'écran Photos de ce même brouillon est toujours affiché, on met à jour
  // sa vignette en direct plutôt que de le laisser marqué "en attente" jusqu'à
  // ce que l'utilisateur y retourne.
  const activeDraft = useConsultationDraftStore.getState();
  if (activeDraft.clientUuid === row.clientUuid) {
    activeDraft.setPhoto({ slot: row.slot, localUri: row.localUri, photoId: photo.id, status: "uploaded" });
  }
}

// Exporté pour un bouton "Réessayer maintenant" côté UI, en plus du
// déclenchement automatique au retour de connexion et après syncPendingDrafts.
export async function syncPendingPhotos(): Promise<void> {
  if (syncingPhotos) return;
  syncingPhotos = true;
  try {
    const pending = getPendingPhotos();
    for (const row of pending) {
      markPhotoStatus(row.id, "syncing");
      try {
        await uploadQueuedPhoto(row);
        removePhotoLocally(row.id);
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Envoi de la photo échoué.";
        markPhotoStatus(row.id, "failed", message);
        const activeDraft = useConsultationDraftStore.getState();
        if (activeDraft.clientUuid === row.clientUuid) {
          activeDraft.setPhoto({ slot: row.slot, localUri: row.localUri, photoId: null, status: "error", errorMessage: message });
        }
      }
      refreshPendingCount();
    }
  } finally {
    syncingPhotos = false;
  }
}

async function replayQueuedSubmit(row: SubmitQueueRow): Promise<void> {
  if (!row.consultationId) return; // pas encore débloqué (voir setSubmitConsultationId)

  if (row.mode === "agent") {
    await submitWalkInConsultation(row.consultationId);
  } else {
    await submitConsultation(row.consultationId);
  }
}

// Toujours rejoué en dernier (voir syncAll) : le serveur rejette l'envoi tant
// que les photos requises de ce dossier ne sont pas réellement reçues — une
// ligne "failed" pour ce motif redevient "pending" au prochain passage et sera
// retentée sans action de l'utilisateur, une fois les photos passées.
export async function syncPendingSubmits(): Promise<void> {
  if (syncingSubmits) return;
  syncingSubmits = true;
  try {
    const pending = getPendingSubmits();
    for (const row of pending) {
      markSubmitStatus(row.clientUuid, "syncing");
      try {
        await replayQueuedSubmit(row);
        removeSubmitLocally(row.clientUuid);
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Échec de l'envoi du dossier.";
        markSubmitStatus(row.clientUuid, "failed", message);
      }
      refreshPendingCount();
    }
  } finally {
    syncingSubmits = false;
  }
}
