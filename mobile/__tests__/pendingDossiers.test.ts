import { describe, expect, it } from "@jest/globals";
import { groupPendingRows, type QueueRow } from "../src/services/offline/pendingDossiers";

function row(overrides: Partial<QueueRow>): QueueRow {
  return {
    kind: "photo",
    clientUuid: "a",
    consultationId: "srv-1",
    status: "pending",
    lastError: null,
    updatedAt: "2026-11-06T10:00:00Z",
    payload: null,
    ...overrides,
  };
}

describe("groupPendingRows", () => {
  it("compte un seul dossier pour toutes ses lignes", () => {
    const dossiers = groupPendingRows(
      [
        row({ kind: "draft", consultationId: null, payload: JSON.stringify({ nomComplet: "ABJ-12" }) }),
        row({ kind: "photo" }),
        row({ kind: "photo" }),
        row({ kind: "submit" }),
      ],
      {},
    );
    expect(dossiers).toHaveLength(1);
    expect(dossiers[0]).toMatchObject({ label: "ABJ-12", photoCount: 2, readyToSend: true, error: null });
  });

  it("garde le code quand le brouillon a déjà quitté la file", () => {
    const [dossier] = groupPendingRows([row({ kind: "photo" })], { a: "ABJ-13" });
    expect(dossier.label).toBe("ABJ-13");
    expect(dossier.readyToSend).toBe(false);
  });

  it("remonte la raison d'un refus du serveur", () => {
    const [dossier] = groupPendingRows([row({ kind: "submit", status: "failed", lastError: "Refusé." })], {});
    expect(dossier.error).toBe("Refusé.");
  });

  it("signale un dossier sans brouillon ni id serveur, que rien ne peut débloquer", () => {
    const [dossier] = groupPendingRows([row({ kind: "submit", consultationId: null })], {});
    expect(dossier.error).toContain("ressaisir");
  });

  it("ne le signale pas tant que le brouillon est en file", () => {
    const [dossier] = groupPendingRows(
      [row({ kind: "draft", consultationId: null }), row({ kind: "submit", consultationId: null })],
      {},
    );
    expect(dossier.error).toBeNull();
  });
});
