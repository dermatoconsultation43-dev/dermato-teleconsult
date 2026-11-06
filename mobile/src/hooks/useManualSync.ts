import { useState } from "react";
import { syncAll, syncDossier } from "../services/offline/syncEngine";
import { useOfflineStore } from "../store/offlineStore";

// Synchronisation déclenchée à la main par l'agent, en plus de l'envoi automatique
// (voir syncEngine.ts). Le résultat se lit directement dans la liste des dossiers
// (voir AgentSyncScreen) : un dossier envoyé en disparaît, un dossier refusé y
// affiche sa raison.
export function useManualSync() {
  const isOnline = useOfflineStore((s) => s.isOnline);
  const [running, setRunning] = useState<string | "all" | null>(null);

  async function run(target: string | "all", sync: () => Promise<void>) {
    if (running || !isOnline) return;
    setRunning(target);
    try {
      await sync();
    } finally {
      setRunning(null);
    }
  }

  return {
    isOnline,
    running,
    syncOne: (clientUuid: string) => run(clientUuid, () => syncDossier(clientUuid)),
    syncEverything: () => run("all", syncAll),
  };
}
