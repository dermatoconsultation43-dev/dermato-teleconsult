import { useState } from "react";
import { Alert } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { refreshPendingCount, syncAll } from "../services/offline/syncEngine";
import { useOfflineStore } from "../store/offlineStore";

// Synchronisation déclenchée à la main par l'agent, en plus de l'envoi automatique
// (voir syncEngine.ts) : quand il sait qu'il a du réseau, il force l'envoi tout de
// suite et voit le résultat, sans attendre le prochain passage automatique.
export function useManualSync() {
  const queryClient = useQueryClient();
  const isOnline = useOfflineStore((s) => s.isOnline);
  const pendingCount = useOfflineStore((s) => s.pendingCount);
  const [syncing, setSyncing] = useState(false);

  async function syncNow() {
    if (syncing) return;
    if (!isOnline) {
      Alert.alert("Pas de connexion", "Connectez-vous à internet, puis relancez la synchronisation.");
      return;
    }
    setSyncing(true);
    try {
      refreshPendingCount();
      await syncAll();
      refreshPendingCount();
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    } finally {
      setSyncing(false);
    }
    const remaining = useOfflineStore.getState().pendingCount;
    Alert.alert(
      remaining === 0 ? "Synchronisation terminée" : "Synchronisation incomplète",
      remaining === 0
        ? "Tous les dossiers ont été envoyés."
        : `${remaining} élément${remaining > 1 ? "s" : ""} encore en attente d'envoi. Vérifiez la connexion et réessayez.`,
    );
  }

  return { syncNow, syncing, isOnline, pendingCount };
}
