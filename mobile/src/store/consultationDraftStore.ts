import { create } from "zustand";
import uuid from "react-native-uuid";
import type { ConsultationDraft, PhotoSlot } from "../types/api";

export interface LocalPhoto {
  slot: PhotoSlot;
  localUri: string;
  photoId: string | null;
  // "queued" : mise en file locale (voir services/offline/photoQueue.ts), en
  // attente de connexion et/ou de l'id serveur de la consultation — distinct de
  // "uploading" (envoi réseau réellement en cours) pour que l'UI affiche un état
  // différent ("en attente" plutôt qu'un spinner qui ne progresse jamais).
  status: "idle" | "queued" | "uploading" | "uploaded" | "error";
  errorMessage?: string;
}

// "patient" : le patient remplit son propre dossier (parcours normal).
// "agent" : un admin saisit un dossier terrain pour une personne sans compte —
// mêmes écrans, mais les appels réseau visent /admin/agent-consultations (voir
// services/api/agent.ts) plutôt que /consultations.
export type ConsultationMode = "patient" | "agent";

interface ConsultationDraftState {
  mode: ConsultationMode;
  clientUuid: string;
  consultationId: string | null;
  refNumber: number | null;
  draft: ConsultationDraft;
  photos: LocalPhoto[];
  consentGiven: boolean;
  updateDraft: (patch: Partial<ConsultationDraft>) => void;
  setMode: (mode: ConsultationMode) => void;
  setConsultationMeta: (id: string, refNumber: number) => void;
  setPhoto: (photo: LocalPhoto) => void;
  removePhoto: (slot: PhotoSlot, localUri: string) => void;
  setConsentGiven: (value: boolean) => void;
  reset: () => void;
}

function freshClientUuid(): string {
  return uuid.v4() as string;
}

// Un seul brouillon "en cours" à la fois pour la V1 — reprendre une consultation
// déjà commencée depuis le dashboard réhydrate ce store à partir de la réponse de
// GET /consultations/:id plutôt que de gérer plusieurs brouillons en parallèle.
export const useConsultationDraftStore = create<ConsultationDraftState>((set) => ({
  mode: "patient",
  clientUuid: freshClientUuid(),
  consultationId: null,
  refNumber: null,
  draft: {},
  photos: [],
  consentGiven: false,

  updateDraft: (patch) => set((state) => ({ draft: { ...state.draft, ...patch } })),

  setMode: (mode) => set({ mode }),

  setConsultationMeta: (id, refNumber) => set({ consultationId: id, refNumber }),

  setPhoto: (photo) =>
    set((state) => {
      const withoutSlotDuplicate =
        photo.slot === "complementaire"
          ? state.photos.filter((p) => p.localUri !== photo.localUri)
          : state.photos.filter((p) => p.slot !== photo.slot);
      return { photos: [...withoutSlotDuplicate, photo] };
    }),

  removePhoto: (slot, localUri) =>
    set((state) => ({ photos: state.photos.filter((p) => !(p.slot === slot && p.localUri === localUri)) })),

  setConsentGiven: (value) => set({ consentGiven: value }),

  reset: () =>
    set({
      mode: "patient",
      clientUuid: freshClientUuid(),
      consultationId: null,
      refNumber: null,
      draft: {},
      photos: [],
      consentGiven: false,
    }),
}));

