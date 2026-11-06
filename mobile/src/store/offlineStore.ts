import { create } from "zustand";
import type { DraftSyncStatus } from "../services/offline/draftQueue";

interface OfflineState {
  isOnline: boolean;
  pendingCount: number;
  /** Change à chaque relecture des files, pour rafraîchir la liste des dossiers. */
  queueRevision: number;
  draftStatuses: Record<string, { status: DraftSyncStatus; error?: string }>;
  setOnline: (online: boolean) => void;
  setPendingCount: (count: number) => void;
  setDraftStatus: (clientUuid: string, status: DraftSyncStatus, error?: string) => void;
}

// État global reflétant la file de synchro locale (services/offline). Les
// écrans lisent ce store pour s'afficher en fonction de la connectivité sans
// avoir à interroger SQLite directement à chaque rendu.
export const useOfflineStore = create<OfflineState>((set) => ({
  isOnline: true,
  pendingCount: 0,
  queueRevision: 0,
  draftStatuses: {},
  setOnline: (online) => set({ isOnline: online }),
  setPendingCount: (count) => set((state) => ({ pendingCount: count, queueRevision: state.queueRevision + 1 })),
  setDraftStatus: (clientUuid, status, error) =>
    set((state) => ({ draftStatuses: { ...state.draftStatuses, [clientUuid]: { status, error } } })),
}));
